import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import {
  itineraryTotal,
  lineTotal,
  type BookingData,
  type ItineraryData,
  type ItineraryDay,
  type ItineraryDetail,
  type ItineraryLine,
  type FlightSegment,
  type HotelStay,
  type PaymentScheduleItem,
  type ItineraryListQuery,
  type ItineraryRow,
  type ItineraryUpdateData,
  type Paginated,
  type PublicItinerary,
} from "@mashkoor/shared";
import { Prisma, type Itinerary } from "@prisma/client";
import { fromDateOnly, orderByFrom, paginate, toDateOnly, toIso, userRef, userRefSelect } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import { randomToken } from "../../../core/auth/crypto";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { BookingsService } from "../../bookings/domain/bookings.service";
import { CompanyService } from "../../company/company.service";
import { CustomersService } from "../../customers/domain/customers.service";

const include = {
  customer: { select: { id: true, fullName: true } },
  lead: { select: { id: true, refNo: true } },
  owner: userRefSelect,
  relationshipManager: userRefSelect,
} satisfies Prisma.ItineraryInclude;
type ItineraryWithRefs = Prisma.ItineraryGetPayload<{ include: typeof include }>;

const DAY = 24 * 3600_000;

/** M10 · Itineraries: build a priced day-by-day plan, share it by link, let the customer accept it, turn it into a booking. */
@Injectable()
export class ItinerariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly activities: ActivitiesService,
    private readonly customers: CustomersService,
    private readonly bookings: BookingsService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly company: CompanyService,
  ) {}

  private shareUrl(token: string | null) {
    return token ? `${this.config.get("APP_URL")}/i/${token}` : null;
  }

  private toRow(i: ItineraryWithRefs): ItineraryRow {
    return {
      id: i.id,
      refNo: i.refNo,
      title: i.title,
      productType: i.productType,
      tripType: i.tripType,
      status: i.status,
      isTemplate: i.isTemplate,
      customer: i.customer,
      lead: i.lead,
      owner: userRef(i.owner),
      destination: i.destination,
      travelFrom: toDateOnly(i.travelFrom),
      totalPrice: i.totalPrice,
      viewCount: i.viewCount,
      shareUrl: this.shareUrl(i.shareToken),
      validUntil: toIso(i.validUntil),
      updatedAt: toIso(i.updatedAt)!,
    };
  }

  private toDetail(i: ItineraryWithRefs): ItineraryDetail {
    return {
      ...this.toRow(i),
      relationshipManager: userRef(i.relationshipManager),
      travelTo: toDateOnly(i.travelTo),
      adults: i.adults,
      children: i.children,
      days: (i.days as unknown as ItineraryDay[]) ?? [],
      lines: (i.lines as unknown as ItineraryLine[]) ?? [],
      inclusions: i.inclusions,
      exclusions: i.exclusions,
      terms: i.terms,
      subject: i.subject,
      quoteDescription: i.quoteDescription,
      quoteNotes: i.quoteNotes,
      adjustment: i.adjustment,
      fullPaymentDueDate: toDateOnly(i.fullPaymentDueDate),
      paymentSchedule: (i.paymentSchedule as unknown as PaymentScheduleItem[]) ?? [],
      flights: (i.flights as unknown as FlightSegment[]) ?? [],
      hotels: (i.hotels as unknown as HotelStay[]) ?? [],
      sharedAt: toIso(i.sharedAt),
      lastViewedAt: toIso(i.lastViewedAt),
      acceptedAt: toIso(i.acceptedAt),
      acceptedBy: i.acceptedBy,
      changesRequestedAt: toIso(i.changesRequestedAt),
      changesRequestNote: i.changesRequestNote,
      convertedBookingId: i.convertedBookingId,
      createdAt: toIso(i.createdAt)!,
    };
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async list(actor: RequestUser, query: ItineraryListQuery): Promise<Paginated<ItineraryRow>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.ItineraryWhereInput = {
      AND: [
        accessibleBy(ability).Itinerary,
        { isTemplate: query.template ?? false },
        query.status ? { status: query.status } : {},
        query.customerId ? { customerId: query.customerId } : {},
        query.leadId ? { leadId: query.leadId } : {},
        query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { refNo: { contains: query.q, mode: "insensitive" } }, { destination: { contains: query.q, mode: "insensitive" } }, { customer: { fullName: { contains: query.q, mode: "insensitive" } } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.itinerary.findMany({ where, include, orderBy: orderByFrom(query.sort, ["updatedAt", "createdAt", "title", "travelFrom"] as const, { updatedAt: "desc" }), ...paginate(query.page, query.pageSize) }),
      this.prisma.itinerary.count({ where }),
    ]);
    return { data: rows.map((r) => this.toRow(r)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(actor: RequestUser, id: string): Promise<ItineraryDetail> {
    await this.findAccessible(actor, id, "read");
    return this.detail(id);
  }

  /** Itineraries shared with the signed-in customer, for the customer portal. */
  async listForCustomer(actor: RequestUser): Promise<ItineraryRow[]> {
    if (!actor.customerId) throw AppError.forbidden();
    const rows = await this.prisma.itinerary.findMany({ where: { customerId: actor.customerId, isTemplate: false, status: { in: ["SHARED", "ACCEPTED", "CONVERTED"] } }, include, orderBy: { sharedAt: "desc" } });
    return rows.map((r) => this.toRow(r));
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  async create(actor: RequestUser, input: ItineraryData): Promise<ItineraryDetail> {
    if (!this.abilities.forUser(actor).can("create", "Itinerary")) throw AppError.forbidden();

    let customerId = input.customerId ?? null;
    if (input.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: input.leadId } });
      if (!lead) throw AppError.notFound("Lead");
      customerId ??= lead.customerId;
    }
    if (customerId) await this.customers.findAccessible(actor, customerId, "read");

    const { travelFrom, travelTo, ownerId, paymentSchedule, flights, hotels, fullPaymentDueDate, ...rest } = input;
    await this.assertManager(rest.relationshipManagerId);
    // A new quotation starts from the company's standard terms unless the author wrote their own.
    const terms = rest.terms ?? (input.isTemplate ? null : (await this.company.get()).defaultTerms);
    const created = await this.prisma.$transaction(async (tx) => {
      const itinerary = await tx.itinerary.create({
        data: {
          ...rest,
          terms,
          paymentSchedule: paymentSchedule as unknown as Prisma.InputJsonValue,
          flights: flights as unknown as Prisma.InputJsonValue,
          hotels: hotels as unknown as Prisma.InputJsonValue,
          customerId,
          leadId: input.leadId ?? null,
          // Templates belong to everyone; a working itinerary belongs to whoever made it unless a manager assigns it.
          ownerId: input.isTemplate ? null : ownerId === undefined ? actor.id : ownerId,
          travelFrom: fromDateOnly(travelFrom),
          travelTo: fromDateOnly(travelTo),
          days: input.days as unknown as Prisma.InputJsonValue,
          lines: input.lines as unknown as Prisma.InputJsonValue,
          fullPaymentDueDate: fromDateOnly(fullPaymentDueDate),
          totalPrice: itineraryTotal(input.lines, input.adjustment),
          refNo: await this.sequences.next("itinerary", tx),
          createdById: actor.id,
        },
      });
      if (!input.isTemplate && (customerId || input.leadId)) {
        await this.activities.record(
          { entityType: input.leadId ? "LEAD" : "CUSTOMER", entityId: (input.leadId ?? customerId)!, customerId, leadId: input.leadId ?? null, type: "SYSTEM", body: `Quotation ${itinerary.refNo} created: ${itinerary.title}`, actorId: actor.id },
          tx,
        );
      }
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "itinerary.created", entityType: "Itinerary", entityId: itinerary.id, after: { refNo: itinerary.refNo, title: itinerary.title } }, tx);
      return itinerary;
    });
    return this.detail(created.id);
  }

  async update(actor: RequestUser, id: string, input: ItineraryUpdateData): Promise<ItineraryDetail> {
    const before = await this.findAccessible(actor, id, "update");
    if (before.status === "ACCEPTED" || before.status === "CONVERTED") throw AppError.conflict("This quotation has been accepted, so it can't be changed. Duplicate it to make a new version.");

    const { travelFrom, travelTo, ownerId, days, lines, customerId, leadId, isTemplate, paymentSchedule, flights, hotels, fullPaymentDueDate, ...rest } = input;
    await this.assertManager(rest.relationshipManagerId);
    if (customerId) await this.customers.findAccessible(actor, customerId, "read");
    const data: Prisma.ItineraryUncheckedUpdateInput = { ...rest };
    if (travelFrom !== undefined) data.travelFrom = fromDateOnly(travelFrom);
    if (travelTo !== undefined) data.travelTo = fromDateOnly(travelTo);
    if (days) data.days = days as unknown as Prisma.InputJsonValue;
    if (paymentSchedule) data.paymentSchedule = paymentSchedule as unknown as Prisma.InputJsonValue;
    if (flights) data.flights = flights as unknown as Prisma.InputJsonValue;
    if (hotels) data.hotels = hotels as unknown as Prisma.InputJsonValue;
    if (fullPaymentDueDate !== undefined) data.fullPaymentDueDate = fromDateOnly(fullPaymentDueDate);
    if (lines) data.lines = lines as unknown as Prisma.InputJsonValue;
    if (lines || rest.adjustment !== undefined) {
      data.totalPrice = itineraryTotal(lines ?? ((before.lines as unknown as ItineraryLine[]) ?? []), rest.adjustment ?? before.adjustment);
    }
    if (customerId !== undefined) data.customerId = customerId;
    if (leadId !== undefined) data.leadId = leadId;
    if (isTemplate !== undefined) {
      data.isTemplate = isTemplate;
      if (isTemplate) data.ownerId = null;
    }
    if (ownerId !== undefined && !isTemplate && this.abilities.forUser(actor).can("manage", "Itinerary")) data.ownerId = ownerId;

    await this.prisma.itinerary.update({ where: { id }, data });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "itinerary.updated", entityType: "Itinerary", entityId: id, before: { title: before.title, totalPrice: before.totalPrice }, after: { fields: Object.keys(input) } });
    return this.detail(id);
  }

  /** The relationship manager is printed on the quotation, so it must be someone who works here. */
  private async assertManager(userId: string | null | undefined) {
    if (!userId) return;
    const user = await this.prisma.user.findFirst({ where: { id: userId, type: "STAFF", status: "ACTIVE" }, select: { id: true } });
    if (!user) throw AppError.notFound("Relationship manager");
  }

  async remove(actor: RequestUser, id: string) {
    const itinerary = await this.findAccessible(actor, id, "delete");
    if (itinerary.status === "CONVERTED") throw AppError.conflict("This quotation became a booking and can't be deleted");
    await this.prisma.itinerary.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "itinerary.deleted", entityType: "Itinerary", entityId: id, before: { refNo: itinerary.refNo, title: itinerary.title } });
  }

  /** Copies an itinerary — to start from a template, or to revise one that's already been accepted. */
  async duplicate(actor: RequestUser, id: string, target: { customerId?: string | null; leadId?: string | null }): Promise<ItineraryDetail> {
    const source = await this.findAccessible(actor, id, "read");
    const d = await this.detail(source.id);
    return this.create(actor, {
      title: source.isTemplate ? source.title : `${source.title} (copy)`,
      productType: source.productType,
      tripType: source.tripType,
      isTemplate: false,
      customerId: target.customerId ?? (source.isTemplate ? null : source.customerId),
      leadId: target.leadId ?? (source.isTemplate ? null : source.leadId),
      ownerId: actor.id,
      destination: source.destination,
      travelFrom: null,
      travelTo: null,
      adults: source.adults,
      children: source.children,
      days: d.days,
      lines: d.lines,
      inclusions: source.inclusions,
      exclusions: source.exclusions,
      terms: source.terms,
      subject: null,
      quoteDescription: null,
      quoteNotes: null,
      adjustment: source.adjustment,
      fullPaymentDueDate: null,
      paymentSchedule: [],
      flights: d.flights,
      hotels: d.hotels,
    });
  }

  /** Publishes the itinerary at a private link and moves a linked lead on to "Proposal shared". */
  async share(actor: RequestUser, id: string, validForDays: number): Promise<ItineraryDetail> {
    const itinerary = await this.findAccessible(actor, id, "update");
    if (itinerary.isTemplate) throw AppError.conflict("Templates can't be shared — make a copy for a customer first");
    if (itinerary.status === "ACCEPTED" || itinerary.status === "CONVERTED") throw AppError.conflict("This quotation has already been accepted");
    if (!itinerary.days || (itinerary.days as unknown[]).length === 0) throw AppError.conflict("Add at least one day to the plan before sharing it");

    await this.prisma.$transaction(async (tx) => {
      await tx.itinerary.update({
        where: { id },
        data: { status: "SHARED", shareToken: itinerary.shareToken ?? randomToken(24), sharedAt: new Date(), validUntil: new Date(Date.now() + validForDays * DAY), changesRequestedAt: null, changesRequestNote: null },
      });
      if (itinerary.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: itinerary.leadId } });
        if (lead && ["NEW", "CONTACTED"].includes(lead.stage)) {
          await tx.lead.update({ where: { id: lead.id }, data: { stage: "QUOTATION", stageChangedAt: new Date() } });
          await this.activities.record({ entityType: "LEAD", entityId: lead.id, customerId: lead.customerId, type: "STAGE_CHANGE", body: `${lead.stage} → QUOTATION (quotation ${itinerary.refNo} shared)`, actorId: actor.id }, tx);
        }
      }
      if (itinerary.leadId || itinerary.customerId) {
        await this.activities.record({ entityType: itinerary.leadId ? "LEAD" : "CUSTOMER", entityId: (itinerary.leadId ?? itinerary.customerId)!, customerId: itinerary.customerId, leadId: itinerary.leadId, type: "SYSTEM", body: `Quotation ${itinerary.refNo} shared with the customer`, actorId: actor.id }, tx);
      }
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "itinerary.shared", entityType: "Itinerary", entityId: id }, tx);
    });
    return this.detail(id);
  }

  async unshare(actor: RequestUser, id: string): Promise<ItineraryDetail> {
    const itinerary = await this.findAccessible(actor, id, "update");
    if (itinerary.status !== "SHARED") throw AppError.conflict("Only a shared quotation can be withdrawn");
    await this.prisma.itinerary.update({ where: { id }, data: { status: "DRAFT", shareToken: null, validUntil: null } });
    return this.detail(id);
  }

  /** Emails the share link to the customer. */
  async sendToCustomer(actor: RequestUser, id: string): Promise<{ sent: boolean; reason?: string }> {
    const itinerary = await this.findAccessible(actor, id, "update");
    if (itinerary.status !== "SHARED" || !itinerary.shareToken) throw AppError.conflict("Share the quotation first");
    const customer = itinerary.customerId ? await this.prisma.customer.findUnique({ where: { id: itinerary.customerId }, select: { fullName: true, email: true } }) : null;
    if (!customer?.email) return { sent: false, reason: "This customer has no email address on file" };
    const owner = itinerary.ownerId ? await this.prisma.user.findUnique({ where: { id: itinerary.ownerId }, select: { name: true } }) : null;
    await this.mail.send({
      ...emails.itineraryShared({ customerName: customer.fullName, title: itinerary.title, url: this.shareUrl(itinerary.shareToken)!, validUntil: itinerary.validUntil, agentName: owner?.name ?? null }),
      to: customer.email,
      toName: customer.fullName,
      entityType: "Itinerary",
      entityId: itinerary.id,
    });
    return { sent: true };
  }

  /** Turns the priced lines into a booking for the customer and marks the itinerary as booked. */
  async convertToBooking(actor: RequestUser, id: string): Promise<{ itinerary: ItineraryDetail; bookingId: string }> {
    const itinerary = await this.findAccessible(actor, id, "update");
    if (itinerary.isTemplate) throw AppError.conflict("Templates can't be booked — make a copy for a customer first");
    if (itinerary.status === "CONVERTED") throw AppError.conflict("This quotation has already been converted");
    if (!itinerary.customerId) throw AppError.conflict("Link a customer before creating the booking");
    const lines = (itinerary.lines as unknown as ItineraryLine[]) ?? [];
    if (lines.length === 0) throw AppError.conflict("Add priced lines to the quotation first");

    const lead = itinerary.leadId ? await this.prisma.lead.findUnique({ where: { id: itinerary.leadId }, select: { source: true } }) : null;
    const booking = await this.bookings.create(actor, {
      customerId: itinerary.customerId,
      leadId: itinerary.leadId,
      productType: itinerary.productType,
      tripType: itinerary.tripType,
      destination: itinerary.destination,
      travelFrom: toDateOnly(itinerary.travelFrom),
      travelTo: toDateOnly(itinerary.travelTo),
      notes: `Created from quotation ${itinerary.refNo}: ${itinerary.title}`,
      source: lead?.source ?? "PHONE",
      ownerId: actor.id,
      // A negative quote adjustment is a discount; the booking carries it so both totals agree.
      discount: Math.max(0, -itinerary.adjustment),
      travelerIds: [],
      items: lines.map((l): BookingData["items"][number] => ({ type: "OTHER", description: l.description, quantity: l.quantity, costPrice: 0, sellPrice: Math.round(lineTotal(l) / l.quantity) })),
    });
    await this.prisma.itinerary.update({ where: { id }, data: { status: "CONVERTED", convertedBookingId: booking.id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "itinerary.converted", entityType: "Itinerary", entityId: id, after: { bookingId: booking.id } });
    return { itinerary: await this.detail(id), bookingId: booking.id };
  }

  /** From the B2C portal: the customer isn't happy with a shared plan and asks for it to be revised. */
  async requestChangesFromCustomer(actor: RequestUser, id: string, message: string): Promise<ItineraryDetail> {
    if (!actor.customerId) throw AppError.forbidden();
    const itinerary = await this.prisma.itinerary.findUnique({ where: { id } });
    if (!itinerary || itinerary.customerId !== actor.customerId) throw AppError.notFound("Itinerary");
    if (itinerary.status !== "SHARED") throw AppError.conflict("Changes can only be requested on a shared plan");

    await this.prisma.itinerary.update({ where: { id }, data: { changesRequestedAt: new Date(), changesRequestNote: message } });
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: actor.customerId }, select: { fullName: true } });
    await this.activities.record({ entityType: "CUSTOMER", entityId: actor.customerId, customerId: actor.customerId, type: "SYSTEM", body: `${customer.fullName} asked for changes to quotation ${itinerary.refNo}` });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "itinerary.changes_requested", entityType: "Itinerary", entityId: id, after: { message } });

    const message_ = emails.itineraryChangesToStaff({ customerName: customer.fullName, title: itinerary.title, message, url: `${this.config.get("APP_URL")}/admin/itineraries/${id}` });
    const owner = itinerary.ownerId ? await this.prisma.user.findUnique({ where: { id: itinerary.ownerId }, select: { name: true, email: true } }) : null;
    if (owner) await this.mail.send({ ...message_, to: owner.email, toName: owner.name, entityType: "Itinerary", entityId: id });
    else await this.mail.sendToStaff(["OPS_MANAGER"], () => ({ ...message_, entityType: "Itinerary", entityId: id }));
    return this.detail(id);
  }

  // ─── Public side (the customer's link) ────────────────────────────────────

  async viewByToken(token: string): Promise<PublicItinerary> {
    const itinerary = await this.findByToken(token);
    // Count the visit, and let the team know the first time the customer opens it.
    const updated = await this.prisma.itinerary.update({ where: { id: itinerary.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } });
    if (itinerary.viewCount === 0 && (itinerary.leadId || itinerary.customerId)) {
      await this.activities.record({ entityType: itinerary.leadId ? "LEAD" : "CUSTOMER", entityId: (itinerary.leadId ?? itinerary.customerId)!, customerId: itinerary.customerId, leadId: itinerary.leadId, type: "SYSTEM", body: `Customer opened quotation ${itinerary.refNo}` });
    }
    return this.toPublic(updated);
  }

  async acceptByToken(token: string, name: string): Promise<PublicItinerary> {
    const itinerary = await this.findByToken(token);
    if (itinerary.status !== "SHARED") throw AppError.conflict(itinerary.status === "DRAFT" ? "This quotation isn't available" : "This quotation has already been accepted");
    if (itinerary.validUntil && itinerary.validUntil < new Date()) throw AppError.conflict("This proposal has expired — please ask us to refresh it");

    const updated = await this.prisma.itinerary.update({ where: { id: itinerary.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedBy: name } });
    if (itinerary.leadId || itinerary.customerId) {
      await this.activities.record({ entityType: itinerary.leadId ? "LEAD" : "CUSTOMER", entityId: (itinerary.leadId ?? itinerary.customerId)!, customerId: itinerary.customerId, leadId: itinerary.leadId, type: "SYSTEM", body: `${name} accepted quotation ${itinerary.refNo}` });
    }
    await this.audit.record({ action: "itinerary.accepted", entityType: "Itinerary", entityId: itinerary.id, after: { acceptedBy: name } });

    const owner = itinerary.ownerId ? await this.prisma.user.findUnique({ where: { id: itinerary.ownerId }, select: { name: true, email: true } }) : null;
    const customer = itinerary.customerId ? await this.prisma.customer.findUnique({ where: { id: itinerary.customerId }, select: { fullName: true } }) : null;
    const message = emails.itineraryAcceptedToStaff({ title: itinerary.title, customerName: customer?.fullName ?? name, url: `${this.config.get("APP_URL")}/admin/itineraries/${itinerary.id}` });
    if (owner) await this.mail.send({ ...message, to: owner.email, toName: owner.name, dedupeKey: `itinerary-accepted:${itinerary.id}:${owner.email}`, entityType: "Itinerary", entityId: itinerary.id });
    await this.mail.sendToStaff(["OPS_MANAGER"], () => ({ ...message, dedupeKey: undefined, entityType: "Itinerary", entityId: itinerary.id }));
    return this.toPublic(updated);
  }

  private async toPublic(i: Itinerary): Promise<PublicItinerary> {
    const [customer, setting] = await Promise.all([
      i.customerId ? this.prisma.customer.findUnique({ where: { id: i.customerId }, select: { fullName: true } }) : null,
      this.prisma.setting.findUnique({ where: { key: "company.profile" } }),
    ]);
    const company = (setting?.value ?? {}) as { name?: string; phones?: string[]; email?: string };
    return {
      title: i.title,
      productType: i.productType,
      destination: i.destination,
      travelFrom: toDateOnly(i.travelFrom),
      travelTo: toDateOnly(i.travelTo),
      adults: i.adults,
      children: i.children,
      days: (i.days as unknown as ItineraryDay[]) ?? [],
      lines: (i.lines as unknown as ItineraryLine[]) ?? [],
      inclusions: i.inclusions,
      exclusions: i.exclusions,
      terms: i.terms,
      totalPrice: i.totalPrice,
      currency: i.currency,
      status: i.status,
      validUntil: toIso(i.validUntil),
      expired: i.status === "SHARED" && !!i.validUntil && i.validUntil < new Date(),
      acceptedAt: toIso(i.acceptedAt),
      customerName: customer?.fullName ?? null,
      company: { name: company.name ?? "Mashkoor International Tourism", phones: company.phones ?? [], email: company.email ?? null },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findByToken(token: string) {
    const itinerary = await this.prisma.itinerary.findUnique({ where: { shareToken: token } });
    if (!itinerary || itinerary.status === "DRAFT") throw AppError.notFound("Itinerary");
    return itinerary;
  }

  async findAccessible(actor: RequestUser, id: string, action: "read" | "update" | "delete") {
    const itinerary = await this.prisma.itinerary.findUnique({ where: { id } });
    if (!itinerary) throw AppError.notFound("Itinerary");
    if (!this.abilities.forUser(actor).can(action, subject("Itinerary", itinerary))) throw AppError.forbidden();
    return itinerary;
  }

  private async detail(id: string) {
    return this.toDetail(await this.prisma.itinerary.findUniqueOrThrow({ where: { id }, include }));
  }
}
