import { HttpStatus, Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import { subject } from "@casl/ability";
import {
  ERROR_CODES,
  normalizePhone,
  OPEN_LEAD_STAGES,
  type CustomerData,
  type CustomerDetail,
  type CustomerListQuery,
  type CustomerRow,
  type CustomerUpdateData,
  type Paginated,
} from "@mashkoor/shared";
import type { Customer, Prisma } from "@prisma/client";
import { orderByFrom, paginate, toIso, userRef, userRefSelect } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { CustomerAccountsService } from "./customer-accounts.service";
import { TravelersService } from "./travelers.service";

const rowInclude = {
  owner: userRefSelect,
  _count: { select: { leads: { where: { stage: { in: [...OPEN_LEAD_STAGES] } } } } },
} satisfies Prisma.CustomerInclude;

type CustomerWithRefs = Prisma.CustomerGetPayload<{ include: typeof rowInclude }>;

const toRow = (c: CustomerWithRefs): CustomerRow => ({
  id: c.id,
  refNo: c.refNo,
  type: c.type,
  fullName: c.fullName,
  phone: c.phone,
  email: c.email,
  city: c.city,
  tags: c.tags,
  source: c.source,
  owner: userRef(c.owner),
  openLeads: c._count.leads,
  createdAt: toIso(c.createdAt)!,
});

export interface DuplicateMatch {
  id: string;
  refNo: string;
  fullName: string;
  phone: string;
  email: string | null;
  matchedOn: "phone" | "email";
}

/** M01 · Customers. */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly activities: ActivitiesService,
    private readonly travelers: TravelersService,
    private readonly accounts: CustomerAccountsService,
  ) {}

  async list(actor: RequestUser, query: CustomerListQuery): Promise<Paginated<CustomerRow>> {
    const ability = this.abilities.forUser(actor);
    const q = query.q;
    const phoneQuery = q ? normalizePhone(q) : null;

    const where: Prisma.CustomerWhereInput = {
      AND: [
        accessibleBy(ability).Customer,
        { deletedAt: null },
        query.type ? { type: query.type } : {},
        query.ownerId ? { ownerId: query.ownerId } : {},
        query.tag ? { tags: { has: query.tag } } : {},
        q
          ? {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { refNo: { contains: q, mode: "insensitive" } },
                { phone: { contains: phoneQuery ?? q.replace(/\s/g, "") } },
              ],
            }
          : {},
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: rowInclude,
        orderBy: orderByFrom(query.sort, ["fullName", "createdAt", "city"] as const, { createdAt: "desc" }),
        ...paginate(query.page, query.pageSize),
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(actor: RequestUser, id: string): Promise<CustomerDetail> {
    const customer = await this.findAccessible(actor, id, "read");
    return this.toDetail(actor, customer.id);
  }

  /** Existing customers with the same phone or email — shown before creating a new record. */
  async findDuplicates(phone?: string | null, email?: string | null, excludeId?: string, onlyPartnerId?: string | null): Promise<DuplicateMatch[]> {
    const normalized = normalizePhone(phone);
    const or: Prisma.CustomerWhereInput[] = [];
    if (normalized) or.push({ phone: normalized }, { altPhone: normalized });
    if (email) or.push({ email: email.toLowerCase() });
    if (!or.length) return [];

    const rows = await this.prisma.customer.findMany({
      // An agency only ever sees matches inside its own customers — never another agency's or Mashkoor's own.
      where: { deletedAt: null, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}), ...(onlyPartnerId ? { partnerId: onlyPartnerId } : {}) },
      take: 5,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((c) => ({
      id: c.id,
      refNo: c.refNo,
      fullName: c.fullName,
      phone: c.phone,
      email: c.email,
      matchedOn: normalized && (c.phone === normalized || c.altPhone === normalized) ? "phone" : "email",
    }));
  }

  /**
   * Creates a customer. Refuses when the phone number already belongs to a customer (409 with the match),
   * unless `allowDuplicate` is set after the user has reviewed the match.
   */
  async create(actor: RequestUser, input: CustomerData, options: { allowDuplicate?: boolean; tx?: Prisma.TransactionClient; partnerId?: string | null } = {}): Promise<Customer> {
    if (!options.allowDuplicate) {
      const duplicates = await this.findDuplicates(input.phone, input.email, undefined, options.partnerId);
      if (duplicates.length) {
        throw new AppError(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, "A customer with this phone number or email already exists", { duplicates });
      }
    }

    const run = async (tx: Prisma.TransactionClient) => {
      const customer = await tx.customer.create({
        data: { ...input, refNo: await this.sequences.next("customer", tx), createdById: actor.id, partnerId: options.partnerId ?? null },
      });
      await this.activities.record({ entityType: "CUSTOMER", entityId: customer.id, customerId: customer.id, type: "SYSTEM", body: "Customer created", actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "customer.created", entityType: "Customer", entityId: customer.id, after: customer }, tx);
      return customer;
    };
    return options.tx ? run(options.tx) : this.prisma.$transaction(run);
  }

  async createAndGet(actor: RequestUser, input: CustomerData, allowDuplicate: boolean, partnerId?: string | null) {
    const customer = await this.create(actor, input, { allowDuplicate, partnerId });
    return this.toDetail(actor, customer.id);
  }

  async update(actor: RequestUser, id: string, input: CustomerUpdateData): Promise<CustomerDetail> {
    const before = await this.findAccessible(actor, id, "update");
    const emailChanged = input.email !== undefined && input.email !== before.email;
    // Fail before saving if the new address belongs to somebody else's login.
    if (emailChanged && input.email) await this.accounts.assertEmailAvailable(id, input.email);
    const after = await this.prisma.customer.update({ where: { id }, data: input });
    if (emailChanged) await this.accounts.syncEmail(id, after.email);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "customer.updated", entityType: "Customer", entityId: id, before, after });
    return this.toDetail(actor, id);
  }

  /**
   * Merges `duplicateId` into `id`: leads, travellers, tasks, timeline, bookings, itineraries and the portal login move to the kept record;
   * the duplicate is soft-deleted and remembers where it went.
   */
  async merge(actor: RequestUser, id: string, duplicateId: string): Promise<CustomerDetail> {
    if (id === duplicateId) throw AppError.conflict("Choose a different customer to merge");
    const keep = await this.findAccessible(actor, id, "merge");
    const duplicate = await this.findAccessible(actor, duplicateId, "merge");
    if ((keep.partnerId ?? null) !== (duplicate.partnerId ?? null)) throw AppError.conflict("These customers belong to different agencies, so they can't be merged");

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keep.id } });
      await tx.traveler.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keep.id } });
      await tx.task.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keep.id } });
      await tx.activity.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keep.id } });
      // Everything the customer bought or was quoted, and their portal login, follows them to the kept record.
      await tx.booking.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keep.id } });
      await tx.itinerary.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keep.id } });
      await tx.user.updateMany({ where: { customerId: duplicate.id, type: "CUSTOMER" }, data: { customerId: keep.id } });
      await tx.customer.update({
        where: { id: keep.id },
        data: {
          email: keep.email ?? duplicate.email,
          altPhone: keep.altPhone ?? (duplicate.phone !== keep.phone ? duplicate.phone : duplicate.altPhone),
          city: keep.city ?? duplicate.city,
          state: keep.state ?? duplicate.state,
          tags: [...new Set([...keep.tags, ...duplicate.tags])],
          notes: [keep.notes, duplicate.notes].filter(Boolean).join("\n\n") || null,
        },
      });
      await tx.customer.update({ where: { id: duplicate.id }, data: { deletedAt: new Date(), mergedIntoId: keep.id } });
      await this.activities.record(
        { entityType: "CUSTOMER", entityId: keep.id, customerId: keep.id, type: "SYSTEM", body: `Merged duplicate ${duplicate.refNo} (${duplicate.fullName})`, actorId: actor.id },
        tx,
      );
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "customer.merged", entityType: "Customer", entityId: keep.id, before: duplicate, after: { mergedIntoId: keep.id } }, tx);
    });

    return this.toDetail(actor, keep.id);
  }

  async remove(actor: RequestUser, id: string) {
    const customer = await this.findAccessible(actor, id, "delete");
    const [openLeads, activeBookings, activeQuotes] = await Promise.all([
      this.prisma.lead.count({ where: { customerId: id, stage: { in: [...OPEN_LEAD_STAGES] } } }),
      this.prisma.booking.count({ where: { customerId: id, status: { notIn: ["CANCELLED", "FAILED", "COMPLETED"] } } }),
      this.prisma.itinerary.count({ where: { customerId: id, isTemplate: false, archivedAt: null, status: { in: ["SHARED", "ACCEPTED"] } } }),
    ]);
    const blockers = [openLeads && `${openLeads} open lead${openLeads === 1 ? "" : "s"}`, activeBookings && `${activeBookings} active booking${activeBookings === 1 ? "" : "s"}`, activeQuotes && `${activeQuotes} live quotation${activeQuotes === 1 ? "" : "s"}`].filter(Boolean);
    if (blockers.length) {
      throw AppError.conflict(`This customer still has ${blockers.join(", ")}. Close or move those first — or merge this customer into another one instead of deleting.`);
    }
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.accounts.disableForCustomer(id);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "customer.deleted", entityType: "Customer", entityId: id, before: customer });
  }

  async findAccessible(actor: RequestUser, id: string, action: "read" | "update" | "merge" | "delete") {
    const customer = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw AppError.notFound("Customer");
    if (!this.abilities.forUser(actor).can(action, subject("Customer", customer))) throw AppError.forbidden();
    return customer;
  }

  private async toDetail(actor: RequestUser, id: string): Promise<CustomerDetail> {
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id }, include: { ...rowInclude, travelers: { orderBy: { createdAt: "asc" } } } });
    return {
      ...toRow(c),
      altPhone: c.altPhone,
      whatsappOptIn: c.whatsappOptIn,
      preferredChannel: c.preferredChannel,
      state: c.state,
      country: c.country,
      notes: c.notes,
      travelers: c.travelers.map((t) => this.travelers.toDto(t, false)),
      updatedAt: toIso(c.updatedAt)!,
    };
  }
}
