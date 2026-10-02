import { HttpStatus, Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import { subject } from "@casl/ability";
import {
  BOARD_STAGES,
  ERROR_CODES,
  LEAD_STAGE_LABELS,
  LOST_REASON_LABELS,
  MANUAL_ACTIVITY_TYPES,
  normalizePhone,
  OPEN_LEAD_STAGES,
  type LeadBoard,
  type LeadData,
  type LeadDetail,
  type LeadListQuery,
  type LeadRow,
  type LeadStage,
  type LeadStageChange,
  type LeadUpdateData,
  type Paginated,
} from "@mashkoor/shared";
import type { Lead, Prisma } from "@prisma/client";
import { fromDateOnly, orderByFrom, paginate, toDateOnly, toIso, userRef, userRefSelect } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { CustomersService } from "../../customers/domain/customers.service";
import { ItinerariesService } from "../../itineraries/domain/itineraries.service";

const include = {
  owner: userRefSelect,
  accountant: userRefSelect,
  customer: { select: { id: true, refNo: true, fullName: true } },
} satisfies Prisma.LeadInclude;

type LeadWithRefs = Prisma.LeadGetPayload<{ include: typeof include }>;

export const toLeadRow = (l: LeadWithRefs): LeadRow => ({
  id: l.id,
  refNo: l.refNo,
  contactName: l.contactName,
  phone: l.phone,
  email: l.email,
  customer: l.customer,
  source: l.source,
  sourceDetail: l.sourceDetail,
  productType: l.productType,
  tripType: l.tripType,
  destination: l.destination,
  travelFrom: toDateOnly(l.travelFrom),
  travelTo: toDateOnly(l.travelTo),
  adults: l.adults,
  children: l.children,
  infants: l.infants,
  stage: l.stage,
  priority: l.priority,
  owner: userRef(l.owner),
  accountant: userRef(l.accountant),
  nextFollowUpAt: toIso(l.nextFollowUpAt),
  lastContactedAt: toIso(l.lastContactedAt),
  stageChangedAt: toIso(l.stageChangedAt)!,
  createdAt: toIso(l.createdAt)!,
});

interface LeadExtras {
  quotation: LeadDetail["quotation"];
  booking: LeadDetail["booking"];
  invoice: LeadDetail["invoice"];
}

const toLeadDetail = (l: LeadWithRefs, extras: LeadExtras): LeadDetail => ({
  ...toLeadRow(l),
  ...extras,
  enquiryRef: l.enquiryRef,
  accountantAssignedAt: toIso(l.accountantAssignedAt),
  flexibleDates: l.flexibleDates,
  budgetMin: l.budgetMin,
  budgetMax: l.budgetMax,
  quotedAmount: l.quotedAmount,
  requirements: l.requirements,
  lostReason: l.lostReason,
  attribution: (l.attribution as Record<string, string | null> | null) ?? null,
  updatedAt: toIso(l.updatedAt)!,
});

/** Stages that need at least one logged contact (PROJECT_PLAN §11.1). */
const STAGES_REQUIRING_CONTACT = new Set<LeadStage>(["CONTACTED", "QUOTATION", "WAITING_PAYMENT", "WON"]);
const BOARD_PAGE_SIZE = 50;

/** M02 · Leads & pipeline. */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly activities: ActivitiesService,
    private readonly customers: CustomersService,
    private readonly itineraries: ItinerariesService,
    private readonly mail: MailService,
  ) {}

  // ─── Queries ──────────────────────────────────────────────────────────────

  private whereFor(actor: RequestUser, query: Omit<LeadListQuery, "page" | "pageSize" | "sort">): Prisma.LeadWhereInput {
    const ability = this.abilities.forUser(actor);
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const q = query.q;
    const phone = q ? normalizePhone(q) : null;

    const owner: Prisma.LeadWhereInput =
      query.owner === "me" ? { ownerId: actor.id } : query.owner === "unassigned" ? { ownerId: null } : query.owner ? { ownerId: query.owner } : {};

    const followUp: Prisma.LeadWhereInput =
      query.followUp === "overdue"
        ? { nextFollowUpAt: { lt: now }, stage: { in: [...OPEN_LEAD_STAGES] } }
        : query.followUp === "today"
          ? { nextFollowUpAt: { lte: endOfToday }, stage: { in: [...OPEN_LEAD_STAGES] } }
          : query.followUp === "week"
            ? { nextFollowUpAt: { lte: weekAhead }, stage: { in: [...OPEN_LEAD_STAGES] } }
            : {};

    return {
      AND: [
        accessibleBy(ability).Lead,
        owner,
        followUp,
        query.stage ? { stage: query.stage } : {},
        query.source ? { source: query.source } : {},
        query.productType ? { productType: query.productType } : {},
        query.tripType ? { tripType: query.tripType } : {},
        query.priority ? { priority: query.priority } : {},
        query.customerId ? { customerId: query.customerId } : {},
        q
          ? {
              OR: [
                { contactName: { contains: q, mode: "insensitive" } },
                { refNo: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { destination: { contains: q, mode: "insensitive" } },
                { phone: { contains: phone ?? q.replace(/\s/g, "") } },
              ],
            }
          : {},
      ],
    };
  }

  async list(actor: RequestUser, query: LeadListQuery): Promise<Paginated<LeadRow>> {
    const where = this.whereFor(actor, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include,
        orderBy: orderByFrom(query.sort, ["createdAt", "nextFollowUpAt", "contactName", "stageChangedAt", "travelFrom"] as const, { createdAt: "desc" }),
        ...paginate(query.page, query.pageSize),
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { data: rows.map(toLeadRow), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Board columns with counts. Each column returns its most urgent leads first. */
  async board(actor: RequestUser, query: Omit<LeadListQuery, "page" | "pageSize" | "sort" | "stage">): Promise<LeadBoard> {
    const where = this.whereFor(actor, query);
    const columns = await Promise.all(
      BOARD_STAGES.map(async (stage) => {
        const stageWhere = { AND: [where, { stage }] };
        const [leads, total] = await this.prisma.$transaction([
          this.prisma.lead.findMany({
            where: stageWhere,
            include,
            orderBy: [{ priority: "asc" }, { nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
            take: BOARD_PAGE_SIZE,
          }),
          this.prisma.lead.count({ where: stageWhere }),
        ]);
        return [stage, { total, leads: leads.map(toLeadRow) }] as const;
      }),
    );
    return Object.fromEntries(columns) as LeadBoard;
  }

  async get(actor: RequestUser, id: string): Promise<LeadDetail> {
    await this.findAccessible(actor, id, "read");
    return this.detail(id);
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  async create(actor: RequestUser, input: LeadData): Promise<LeadDetail> {
    const ability = this.abilities.forUser(actor);
    // Sales agents may only create leads for themselves or the unassigned queue.
    if (input.ownerId && input.ownerId !== actor.id && !ability.can("assign", "Lead")) {
      throw AppError.forbidden("Only managers can assign leads to other people");
    }
    if (input.ownerId) await this.assertAssignable(input.ownerId);

    let customerId = input.customerId ?? null;
    if (customerId) await this.customers.findAccessible(actor, customerId, "read");
    else customerId = (await this.customers.findDuplicates(input.phone, input.email))[0]?.id ?? null;

    const lead = await this.prisma.$transaction(async (tx) => {
      const { travelFrom, travelTo, nextFollowUpAt, ...rest } = input;
      const created = await tx.lead.create({
        data: {
          ...rest,
          refNo: await this.sequences.next("lead", tx),
          customerId,
          ownerId: input.ownerId === undefined ? actor.id : input.ownerId,
          travelFrom: fromDateOnly(travelFrom),
          travelTo: fromDateOnly(travelTo),
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
          createdById: actor.id,
        },
      });
      await this.activities.record({ entityType: "LEAD", entityId: created.id, customerId, type: "SYSTEM", body: "Lead created", actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "lead.created", entityType: "Lead", entityId: created.id, after: created }, tx);
      return created;
    });
    return this.detail(lead.id);
  }

  /** A B2B partner raising an enquiry with Mashkoor. Unassigned until a sales agent picks it up. */
  async createForPartner(actor: RequestUser, input: LeadData): Promise<LeadDetail> {
    if (!actor.partnerId) throw AppError.forbidden();
    let customerId = input.customerId ?? null;
    if (customerId) await this.customers.findAccessible(actor, customerId, "read");

    const lead = await this.prisma.$transaction(async (tx) => {
      const { travelFrom, travelTo, nextFollowUpAt, ...rest } = input;
      const created = await tx.lead.create({
        data: {
          ...rest,
          refNo: await this.sequences.next("lead", tx),
          customerId,
          source: "B2B",
          partnerId: actor.partnerId,
          ownerId: null,
          travelFrom: fromDateOnly(travelFrom),
          travelTo: fromDateOnly(travelTo),
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
          createdById: actor.id,
        },
      });
      await this.activities.record({ entityType: "LEAD", entityId: created.id, customerId, type: "SYSTEM", body: "Enquiry received from partner", actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "lead.created", entityType: "Lead", entityId: created.id, after: created }, tx);
      return created;
    });
    return this.detail(lead.id);
  }

  /** A B2C customer requesting a new trip from their own account. Unassigned until a sales agent picks it up. */
  async createForCustomer(actor: RequestUser, input: LeadData): Promise<LeadDetail> {
    if (!actor.customerId) throw AppError.forbidden();
    const customer = await this.customers.get(actor, actor.customerId);

    const lead = await this.prisma.$transaction(async (tx) => {
      const { travelFrom, travelTo, nextFollowUpAt, ...rest } = input;
      const created = await tx.lead.create({
        data: {
          ...rest,
          contactName: customer.fullName,
          phone: customer.phone,
          email: customer.email,
          refNo: await this.sequences.next("lead", tx),
          customerId: actor.customerId,
          source: "B2C_PORTAL",
          ownerId: null,
          travelFrom: fromDateOnly(travelFrom),
          travelTo: fromDateOnly(travelTo),
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
          createdById: actor.id,
        },
      });
      await this.activities.record({ entityType: "LEAD", entityId: created.id, customerId: actor.customerId, type: "SYSTEM", body: "Trip request received from customer portal", actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "lead.created", entityType: "Lead", entityId: created.id, after: created }, tx);
      return created;
    });
    return this.detail(lead.id);
  }

  async update(actor: RequestUser, id: string, input: LeadUpdateData): Promise<LeadDetail> {
    const before = await this.findAccessible(actor, id, "update");
    const { travelFrom, travelTo, nextFollowUpAt, ...rest } = input;

    const nextFrom = travelFrom === undefined ? before.travelFrom : fromDateOnly(travelFrom);
    const nextTo = travelTo === undefined ? before.travelTo : fromDateOnly(travelTo);
    if (nextFrom && nextTo && nextTo < nextFrom) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_FAILED, "Return must be after departure", { fieldErrors: { travelTo: "Return must be after departure" } });
    }

    const after = await this.prisma.lead.update({
      where: { id },
      data: {
        ...rest,
        travelFrom: fromDateOnly(travelFrom),
        travelTo: fromDateOnly(travelTo),
        nextFollowUpAt: nextFollowUpAt === undefined ? undefined : nextFollowUpAt ? new Date(nextFollowUpAt) : null,
      },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "lead.updated", entityType: "Lead", entityId: id, before, after });
    return this.detail(id);
  }

  async changeStage(actor: RequestUser, id: string, change: LeadStageChange): Promise<LeadDetail> {
    const lead = await this.findAccessible(actor, id, "update");
    if (lead.stage === change.stage) return this.detail(id);

    if (STAGES_REQUIRING_CONTACT.has(change.stage)) {
      const contacts = await this.prisma.activity.count({ where: { leadId: id, type: { in: [...MANUAL_ACTIVITY_TYPES] } } });
      if (contacts === 0 && !change.note) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "LEAD_NO_CONTACT", "Log a call, message or note before moving this lead forward", {
          fieldErrors: { note: "Add a note about your conversation" },
        });
      }
    }
    if (change.stage === "WAITING_PAYMENT") {
      const quotations = await this.prisma.itinerary.count({ where: { leadId: id, isTemplate: false, status: { in: ["SHARED", "ACCEPTED", "CONVERTED"] } } });
      if (quotations === 0) throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "LEAD_NO_QUOTATION", "Send a quotation to the customer before moving this lead to payment");
      // From here the person is a customer: create the record now so super admin and accounts can see their details.
      if (!lead.customerId) {
        // Someone with this number may already be a customer — link to them rather than stopping on a duplicate.
        const existing = (await this.customers.findDuplicates(lead.phone, lead.email))[0];
        await this.convertToCustomer(actor, id, existing?.id);
        lead.customerId = (await this.prisma.lead.findUniqueOrThrow({ where: { id }, select: { customerId: true } })).customerId;
      }
      await this.prisma.itinerary.updateMany({ where: { leadId: id, customerId: null }, data: { customerId: lead.customerId } });
    }
    if (change.stage === "WON" && !lead.customerId) {
      // Phase 2 will require a linked booking; until then a won lead must at least be a customer.
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "LEAD_NOT_CONVERTED", "Convert this lead to a customer before marking it won");
    }

    await this.prisma.$transaction(async (tx) => {
      if (change.note) {
        await this.activities.record({ entityType: "LEAD", entityId: id, customerId: lead.customerId, type: "NOTE", body: change.note, actorId: actor.id }, tx);
      }
      await tx.lead.update({
        where: { id },
        data: {
          stage: change.stage,
          stageChangedAt: new Date(),
          lostReason: change.stage === "LOST" ? change.lostReason : null,
          // A closed lead has nothing left to follow up.
          nextFollowUpAt: change.stage === "WON" || change.stage === "LOST" ? null : undefined,
        },
      });
      const reason = change.stage === "LOST" && change.lostReason ? ` — ${LOST_REASON_LABELS[change.lostReason]}` : "";
      await this.activities.record(
        {
          entityType: "LEAD",
          entityId: id,
          customerId: lead.customerId,
          type: "STAGE_CHANGE",
          body: `${LEAD_STAGE_LABELS[lead.stage]} → ${LEAD_STAGE_LABELS[change.stage]}${reason}`,
          meta: { from: lead.stage, to: change.stage, lostReason: change.lostReason ?? null },
          actorId: actor.id,
        },
        tx,
      );
    });
    if (change.stage === "WAITING_PAYMENT") {
      await this.mail.sendToStaff(["SUPER_ADMIN"], () => ({
        subject: `${lead.contactName} is awaiting payment — assign an accountant (${lead.refNo})`,
        text: `${lead.contactName} has accepted the quotation and ${lead.refNo} is now at "Awaiting payment". Open the lead and assign an accountant so an invoice can be raised and payments recorded.`,
        entityType: "Lead",
        entityId: id,
      }));
    }
    return this.detail(id);
  }

  async assign(actor: RequestUser, id: string, ownerId: string | null): Promise<LeadDetail> {
    const lead = await this.findAccessible(actor, id, "read");
    const ability = this.abilities.forUser(actor);
    const selfClaim = ownerId === actor.id && lead.ownerId === null;
    if (!selfClaim && !ability.can("assign", "Lead")) throw AppError.forbidden("Only managers can reassign leads");
    if (ownerId) await this.assertAssignable(ownerId);

    const owner = ownerId ? await this.prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { ownerId } });
      await this.activities.record(
        { entityType: "LEAD", entityId: id, customerId: lead.customerId, type: "SYSTEM", body: owner ? `Assigned to ${owner.name}` : "Moved to unassigned", meta: { from: lead.ownerId, to: ownerId }, actorId: actor.id },
        tx,
      );
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "lead.assigned", entityType: "Lead", entityId: id, before: { ownerId: lead.ownerId }, after: { ownerId } }, tx);
    });
    return this.detail(id);
  }

  /**
   * Super admin hands a lead that is awaiting payment to an accountant. The accepted quotation becomes a booking (the
   * accountant records payments against it) and the sales owner keeps read-only access. Passing null takes it back.
   */
  async assignAccountant(actor: RequestUser, id: string, accountantId: string | null): Promise<LeadDetail> {
    const lead = await this.findAccessible(actor, id, "read");
    const ability = this.abilities.forUser(actor);
    if (!ability.can("assign", "Lead")) throw AppError.forbidden("Only managers can assign an accountant");

    if (!accountantId) {
      await this.prisma.lead.update({ where: { id }, data: { accountantId: null, accountantAssignedAt: null } });
      await this.activities.record({ entityType: "LEAD", entityId: id, customerId: lead.customerId, type: "SYSTEM", body: "Taken back from accounts", actorId: actor.id });
      return this.detail(id);
    }

    if (lead.stage !== "WAITING_PAYMENT") throw AppError.conflict("Move the lead to Awaiting payment before handing it to an accountant");
    const accountant = await this.prisma.user.findFirst({ where: { id: accountantId, type: "STAFF", status: "ACTIVE", role: { in: ["ACCOUNTS", "SUPER_ADMIN"] } }, select: { id: true, name: true, email: true } });
    if (!accountant) throw AppError.notFound("Accountant");

    // The accountant works on a booking, so make sure the accepted quotation has become one.
    const existing = await this.prisma.booking.findFirst({ where: { leadId: id, status: { not: "CANCELLED" } }, select: { id: true } });
    if (!existing) {
      const quotation = await this.prisma.itinerary.findFirst({ where: { leadId: id, isTemplate: false, status: { in: ["ACCEPTED", "SHARED"] } }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (!quotation) throw AppError.conflict("There is no quotation to bill. Send one to the customer first.");
      await this.itineraries.convertToBooking(actor, quotation.id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { accountantId: accountant.id, accountantAssignedAt: new Date() } });
      await this.activities.record({ entityType: "LEAD", entityId: id, customerId: lead.customerId, type: "SYSTEM", body: `Handed to accountant ${accountant.name} for invoicing and payment`, meta: { accountantId: accountant.id }, actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "lead.accountant_assigned", entityType: "Lead", entityId: id, before: { accountantId: lead.accountantId }, after: { accountantId: accountant.id } }, tx);
    });
    await this.mail.send({
      to: accountant.email,
      toName: accountant.name,
      subject: `${lead.contactName} (${lead.refNo}) is ready for invoicing`,
      text: `${lead.contactName} has accepted the quotation. Open the lead in the dashboard to create the invoice, send it, and record the payments as they arrive.`,
      entityType: "Lead",
      entityId: id,
    });
    return this.detail(id);
  }

  async bulkUpdate(actor: RequestUser, ids: string[], changes: { ownerId?: string | null; priority?: Lead["priority"] }) {
    const ability = this.abilities.forUser(actor);
    if (changes.ownerId !== undefined && !ability.can("assign", "Lead")) throw AppError.forbidden("Only managers can reassign leads");
    if (changes.ownerId) await this.assertAssignable(changes.ownerId);

    const { count } = await this.prisma.lead.updateMany({
      where: { AND: [accessibleBy(ability, "update").Lead, { id: { in: ids } }] },
      data: { ownerId: changes.ownerId, priority: changes.priority },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "lead.bulk_updated", entityType: "Lead", after: { ids, changes, count } });
    return { updated: count };
  }

  /** Links the lead to an existing customer, or creates one from the lead's contact details. */
  async convertToCustomer(actor: RequestUser, id: string, customerId?: string): Promise<LeadDetail> {
    const lead = await this.findAccessible(actor, id, "update");
    if (lead.customerId && lead.customerId === customerId) return this.detail(id);

    await this.prisma.$transaction(async (tx) => {
      let targetId = customerId;
      if (targetId) {
        await this.customers.findAccessible(actor, targetId, "read");
      } else {
        const created = await this.customers.create(
          actor,
          {
            type: lead.adults + lead.children + lead.infants > 1 ? "FAMILY" : "INDIVIDUAL",
            fullName: lead.contactName,
            phone: lead.phone,
            altPhone: null,
            email: lead.email,
            whatsappOptIn: true,
            preferredChannel: "WHATSAPP",
            city: null,
            state: null,
            country: "IN",
            tags: [],
            source: lead.source,
            ownerId: lead.ownerId,
            notes: null,
          },
          { allowDuplicate: false, tx },
        );
        targetId = created.id;
      }

      await tx.lead.update({ where: { id }, data: { customerId: targetId } });
      // Bring the lead's history into the Customer 360 timeline.
      await tx.activity.updateMany({ where: { leadId: id }, data: { customerId: targetId } });
      await tx.task.updateMany({ where: { leadId: id, customerId: null }, data: { customerId: targetId } });
      await this.activities.record({ entityType: "LEAD", entityId: id, customerId: targetId, type: "SYSTEM", body: customerId ? "Linked to existing customer" : "Converted to customer", actorId: actor.id }, tx);
    });
    return this.detail(id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async findAccessible(actor: RequestUser, id: string, action: "read" | "update") {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw AppError.notFound("Lead");
    const ability = this.abilities.forUser(actor);
    if (!ability.can(action, subject("Lead", lead))) throw AppError.forbidden();
    // Once the lead is with accounts, the sales rep who brought it in can still follow it but not change it.
    if (action === "update" && lead.accountantId && !ability.can("assign", "Lead")) {
      throw AppError.forbidden("This lead has been handed to accounts, so it is now read-only");
    }
    return lead;
  }

  private async assertAssignable(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, type: "STAFF", status: "ACTIVE" } });
    if (!user) throw AppError.notFound("Assignee");
  }

  private async detail(id: string) {
    const [lead, quotation, booking, invoice] = await Promise.all([
      this.prisma.lead.findUniqueOrThrow({ where: { id }, include }),
      this.prisma.itinerary.findFirst({ where: { leadId: id, isTemplate: false }, orderBy: { createdAt: "desc" }, select: { id: true, refNo: true, status: true } }),
      this.prisma.booking.findFirst({ where: { leadId: id, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, select: { id: true, refNo: true } }),
      this.prisma.invoice.findFirst({ where: { leadId: id, status: "ISSUED" }, orderBy: { createdAt: "desc" }, select: { id: true, refNo: true } }),
    ]);
    return toLeadDetail(lead, { quotation, booking, invoice });
  }
}
