import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import { subject } from "@casl/ability";
import {
  normalizePhone,
  type EnquiryBoard,
  type EnquiryConvertData,
  type EnquiryData,
  type EnquiryListQuery,
  type EnquiryRow,
  type EnquiryStatusChange,
  type EnquiryUpdateData,
  type LeadDetail,
  type Paginated,
} from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { fromDateOnly, orderByFrom, paginate, toIso, userRef, userRefSelect } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { CustomersService } from "../../customers/domain/customers.service";
import { LeadsService } from "./leads.service";

const include = { owner: userRefSelect } satisfies Prisma.EnquiryInclude;
type EnquiryWithRefs = Prisma.EnquiryGetPayload<{ include: typeof include }>;

const toRow = (e: EnquiryWithRefs): EnquiryRow => ({
  id: e.id,
  refNo: e.refNo,
  contactName: e.contactName,
  phone: e.phone,
  email: e.email,
  source: e.source,
  sourceDetail: e.sourceDetail,
  message: e.message,
  notes: e.notes,
  status: e.status,
  owner: userRef(e.owner),
  assignedAt: toIso(e.assignedAt),
  lastContactedAt: toIso(e.lastContactedAt),
  createdAt: toIso(e.createdAt)!,
});

const BOARD_PAGE_SIZE = 50;

/**
 * Raw enquiries. They arrive with only a name and a way to reach the person; the admin assigns one to a sales
 * representative, who calls, and — once they know what the customer wants — converts it into a Lead. Converting
 * creates the lead and deletes the enquiry (its reference is kept on the lead, and the history in the audit log).
 */
@Injectable()
export class EnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly activities: ActivitiesService,
    private readonly customers: CustomersService,
    private readonly leads: LeadsService,
    private readonly mail: MailService,
  ) {}

  // ─── Queries ──────────────────────────────────────────────────────────────

  private whereFor(actor: RequestUser, query: Pick<EnquiryListQuery, "q" | "status" | "owner">): Prisma.EnquiryWhereInput {
    const q = query.q;
    const phone = q ? normalizePhone(q) : null;
    const owner: Prisma.EnquiryWhereInput = query.owner === "me" ? { ownerId: actor.id } : query.owner === "unassigned" ? { ownerId: null } : query.owner ? { ownerId: query.owner } : {};
    return {
      AND: [
        accessibleBy(this.abilities.forUser(actor)).Enquiry,
        owner,
        query.status ? { status: query.status } : {},
        q
          ? {
              OR: [
                { contactName: { contains: q, mode: "insensitive" } },
                { refNo: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: phone ?? q.replace(/\s/g, "") } },
              ],
            }
          : {},
      ],
    };
  }

  async list(actor: RequestUser, query: EnquiryListQuery): Promise<Paginated<EnquiryRow>> {
    const where = this.whereFor(actor, query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.enquiry.findMany({ where, include, orderBy: orderByFrom(query.sort, ["createdAt", "contactName", "assignedAt"] as const, { createdAt: "desc" }), ...paginate(query.page, query.pageSize) }),
      this.prisma.enquiry.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Unassigned / new / contacted columns, oldest first so nothing sits forgotten. */
  async board(actor: RequestUser, query: Pick<EnquiryListQuery, "q" | "owner">): Promise<EnquiryBoard> {
    const base = this.whereFor(actor, { ...query, status: undefined });
    const column = async (extra: Prisma.EnquiryWhereInput) => {
      const where = { AND: [base, extra] };
      const [rows, total] = await this.prisma.$transaction([this.prisma.enquiry.findMany({ where, include, orderBy: { createdAt: "asc" }, take: BOARD_PAGE_SIZE }), this.prisma.enquiry.count({ where })]);
      return { total, enquiries: rows.map(toRow) };
    };
    const [unassigned, fresh, contacted] = await Promise.all([column({ ownerId: null }), column({ ownerId: { not: null }, status: "NEW" }), column({ ownerId: { not: null }, status: "CONTACTED" })]);
    return { unassigned, new: fresh, contacted };
  }

  async get(actor: RequestUser, id: string): Promise<EnquiryRow> {
    await this.findAccessible(actor, id, "read");
    return this.detail(id);
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  /** A call or walk-in written down by staff. Sales reps own what they create; managers can assign it on. */
  async create(actor: RequestUser, input: EnquiryData): Promise<EnquiryRow> {
    const ability = this.abilities.forUser(actor);
    let ownerId = input.ownerId ?? null;
    if (ownerId && ownerId !== actor.id && !ability.can("assign", "Enquiry")) throw AppError.forbidden("Only managers can assign enquiries");
    if (!ownerId && !ability.can("assign", "Enquiry")) ownerId = actor.id;
    if (ownerId) await this.assertAssignable(ownerId);

    const created = await this.prisma.$transaction(async (tx) => {
      const enquiry = await tx.enquiry.create({
        data: {
          refNo: await this.sequences.next("enquiry", tx),
          contactName: input.contactName,
          phone: input.phone,
          email: input.email,
          source: input.source,
          sourceDetail: input.sourceDetail,
          message: input.message,
          ownerId,
          assignedAt: ownerId ? new Date() : null,
          createdById: actor.id,
        },
      });
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "enquiry.created", entityType: "Enquiry", entityId: enquiry.id, after: { source: input.source, ownerId } }, tx);
      return enquiry;
    });
    return this.detail(created.id);
  }

  async update(actor: RequestUser, id: string, input: EnquiryUpdateData): Promise<EnquiryRow> {
    const before = await this.findAccessible(actor, id, "update");
    const after = await this.prisma.enquiry.update({ where: { id }, data: input });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "enquiry.updated", entityType: "Enquiry", entityId: id, before, after });
    return this.detail(id);
  }

  async assign(actor: RequestUser, id: string, ownerId: string | null): Promise<EnquiryRow> {
    const enquiry = await this.findAccessible(actor, id, "read");
    const ability = this.abilities.forUser(actor);
    const selfClaim = ownerId === actor.id && enquiry.ownerId === null && ability.can("update", subject("Enquiry", { ...enquiry, ownerId: actor.id }));
    if (!selfClaim && !ability.can("assign", "Enquiry")) throw AppError.forbidden("Only managers can assign enquiries");
    if (ownerId) await this.assertAssignable(ownerId);

    await this.prisma.enquiry.update({ where: { id }, data: { ownerId, assignedAt: ownerId ? new Date() : null } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "enquiry.assigned", entityType: "Enquiry", entityId: id, before: { ownerId: enquiry.ownerId }, after: { ownerId } });
    if (ownerId && ownerId !== actor.id) await this.notifyAssignee(ownerId, enquiry.refNo, enquiry.contactName);
    return this.detail(id);
  }

  async changeStatus(actor: RequestUser, id: string, change: EnquiryStatusChange): Promise<EnquiryRow> {
    const enquiry = await this.findAccessible(actor, id, "update");
    if (!enquiry.ownerId) throw AppError.conflict("Assign this enquiry to a sales representative first");
    const stamp = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());
    const notes = change.note ? [enquiry.notes, `[${stamp}] ${change.note}`].filter(Boolean).join("\n") : enquiry.notes;
    await this.prisma.enquiry.update({
      where: { id },
      data: { status: change.status, notes, lastContactedAt: change.status === "CONTACTED" ? new Date() : enquiry.lastContactedAt },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "enquiry.status_changed", entityType: "Enquiry", entityId: id, before: { status: enquiry.status }, after: { status: change.status } });
    return this.detail(id);
  }

  /** Creates the lead from the call and removes the enquiry. The lead starts at "Requirements taken". */
  async convert(actor: RequestUser, id: string, input: EnquiryConvertData): Promise<LeadDetail> {
    const enquiry = await this.findAccessible(actor, id, "update");
    if (!enquiry.ownerId) throw AppError.conflict("Assign this enquiry to a sales representative first");

    const customerId = (await this.customers.findDuplicates(enquiry.phone, enquiry.email))[0]?.id ?? null;
    const { requirements, priority, travelFrom, travelTo, ...fields } = input;

    const leadId = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          refNo: await this.sequences.next("lead", tx),
          customerId,
          contactName: enquiry.contactName,
          phone: enquiry.phone,
          email: enquiry.email,
          source: enquiry.source,
          sourceDetail: enquiry.sourceDetail,
          attribution: enquiry.attribution ?? undefined,
          ...fields,
          travelFrom: fromDateOnly(travelFrom),
          travelTo: fromDateOnly(travelTo),
          requirements: [requirements, enquiry.message && `Original enquiry: ${enquiry.message}`].filter(Boolean).join("\n\n"),
          stage: "CONTACTED",
          priority,
          ownerId: enquiry.ownerId,
          lastContactedAt: new Date(),
          enquiryRef: enquiry.refNo,
          createdById: actor.id,
        },
      });
      await this.activities.record({ entityType: "LEAD", entityId: lead.id, customerId, type: "SYSTEM", body: `Created from enquiry ${enquiry.refNo} (${enquiry.sourceDetail ?? enquiry.source})`, actorId: actor.id }, tx);
      await this.activities.record({ entityType: "LEAD", entityId: lead.id, customerId, type: "NOTE", body: `Requirements taken on the call:\n${requirements}${enquiry.notes ? `\n\nCall notes:\n${enquiry.notes}` : ""}`, actorId: actor.id }, tx);
      // Keep the website/intake trail pointing at the lead now that the enquiry is gone.
      await tx.inboundEvent.updateMany({ where: { enquiryId: enquiry.id }, data: { leadId: lead.id, enquiryId: null } });
      await tx.enquiry.delete({ where: { id: enquiry.id } });
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "enquiry.converted", entityType: "Enquiry", entityId: enquiry.id, before: enquiry, after: { leadId: lead.id, leadRefNo: lead.refNo } }, tx);
      return lead.id;
    });
    return this.leads.get(actor, leadId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async findAccessible(actor: RequestUser, id: string, action: "read" | "update") {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw AppError.notFound("Enquiry");
    if (!this.abilities.forUser(actor).can(action, subject("Enquiry", enquiry))) throw AppError.forbidden();
    return enquiry;
  }

  private async assertAssignable(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, type: "STAFF", status: "ACTIVE", role: { in: ["SALES_AGENT", "OPS_MANAGER", "SUPER_ADMIN"] } } });
    if (!user) throw AppError.notFound("Assignee");
  }

  private async notifyAssignee(userId: string, refNo: string, contactName: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (user) await this.mail.send({ to: user.email, toName: user.name, subject: `Enquiry ${refNo} assigned to you — ${contactName}`, text: `${contactName} is waiting for your call. Open Enquiries in the dashboard to see their details.` });
  }

  private async detail(id: string) {
    return toRow(await this.prisma.enquiry.findUniqueOrThrow({ where: { id }, include }));
  }
}
