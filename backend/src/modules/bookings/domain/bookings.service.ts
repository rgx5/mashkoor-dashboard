import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import {
  BOOKING_STATUS_TRANSITIONS,
  BOOKING_STATUS_LABELS,
  ERROR_CODES,
  normalizePhone,
  type BookingData,
  type BookingDetail,
  type BookingItemData,
  type BookingItemUpdateData,
  type BookingListQuery,
  type BookingRow,
  type BookingStatus,
  type BookingStatusChange,
  type BookingUpdateData,
  type Paginated,
  type PackagePriceTier,
  type TripType,
} from "@mashkoor/shared";
import type { Booking, BookingItem, Prisma } from "@prisma/client";
import { CSV_BOM, csvRow } from "../../../common/csv";
import { fromDateOnly, orderByFrom, paginate, toDateOnly, toIso, userRef, userRefSelect } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { CustomersService } from "../../customers/domain/customers.service";
import { InventoryAvailabilityService } from "../../inventory/domain/inventory-availability.service";
import { PaymentsService } from "../../payments/domain/payments.service";
import { PricingService } from "../../pricing/domain/pricing.service";
import { WalletService } from "../../wallet/domain/wallet.service";

const include = {
  customer: { select: { id: true, refNo: true, fullName: true, phone: true } },
  lead: { select: { id: true, refNo: true } },
  owner: userRefSelect,
  items: {
    include: {
      package: { select: { id: true, refCode: true, title: true } },
      flightSeatBlock: { select: { id: true, airline: true, flightNumber: true, origin: true, destination: true, departureAt: true } },
      ratePeriod: { select: { id: true, startDate: true, endDate: true, roomType: { select: { id: true, name: true, hotel: { select: { id: true, name: true, city: true } } } } } },
    },
  },
  travelers: { select: { id: true, firstName: true, lastName: true, relation: true } },
} satisfies Prisma.BookingInclude;

type BookingWithRefs = Prisma.BookingGetPayload<{ include: typeof include }>;

/** Cost and margin only go to staff who can manage bookings (managers) — sales agents see sell price only. */
const toRow = (b: BookingWithRefs, canSeeCost: boolean): BookingRow => ({
  id: b.id,
  refNo: b.refNo,
  customer: b.customer,
  lead: b.lead,
  productType: b.productType,
  tripType: b.tripType,
  status: b.status,
  destination: b.destination,
  travelFrom: toDateOnly(b.travelFrom),
  travelTo: toDateOnly(b.travelTo),
  totalCost: canSeeCost ? b.totalCost : null,
  totalSell: b.totalSell,
  discount: b.discount,
  currency: b.currency,
  source: b.source,
  owner: userRef(b.owner),
  cancelRequestedAt: toIso(b.cancelRequestedAt),
  createdAt: toIso(b.createdAt)!,
});

const toDetail = (b: BookingWithRefs, canSeeCost: boolean): BookingDetail => ({
  ...toRow(b, canSeeCost),
  notes: b.notes,
  cancellationFee: b.cancellationFee,
  cancelledAt: toIso(b.cancelledAt),
  cancelReason: b.cancelReason,
  cancelRequestReason: b.cancelRequestReason,
  items: b.items.map((i) => ({
    id: i.id,
    type: i.type,
    description: i.description,
    quantity: i.quantity,
    costPrice: canSeeCost ? i.costPrice : null,
    sellPrice: i.sellPrice,
    package: i.package,
    flightSeatBlock: i.flightSeatBlock ? { ...i.flightSeatBlock, departureAt: toIso(i.flightSeatBlock.departureAt)! } : null,
    ratePeriod: i.ratePeriod ? { id: i.ratePeriod.id, startDate: toDateOnly(i.ratePeriod.startDate)!, endDate: toDateOnly(i.ratePeriod.endDate)!, roomType: i.ratePeriod.roomType } : null,
    partnerQuoted: (i.meta as { partnerQuoted?: boolean } | null)?.partnerQuoted === true,
  })),
  travelers: b.travelers,
  updatedAt: toIso(b.updatedAt)!,
});

/** Statuses before Mashkoor has started work: items and the discount can still change, a partner can cancel outright. */
const PRE_PROGRESS: readonly BookingStatus[] = ["INQUIRY", "QUOTE", "PENDING_PAYMENT", "PENDING_APPROVAL"];
const CLOSED: readonly BookingStatus[] = ["CANCELLED", "FAILED", "COMPLETED"];
/**
 * What a salesperson may do to a booking's status by themselves — while nothing is committed to a customer, supplier or
 * wallet. Approving, starting work, confirming, failing, completing and cancelling anything further along are manager
 * decisions (PROJECT_PLAN §3.2: sales "request only"); they use "Request cancellation" instead.
 */
const SALES_TRANSITIONS: Partial<Record<BookingStatus, readonly BookingStatus[]>> = {
  INQUIRY: ["QUOTE", "CANCELLED"],
  QUOTE: ["INQUIRY", "PENDING_PAYMENT", "CANCELLED"],
};
const CSV_EXPORT_CAP = 20_000;

/** M07 · Bookings — register, wizard, status workflow, cancellation with inventory release. */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger("Bookings");

  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly activities: ActivitiesService,
    private readonly customers: CustomersService,
    private readonly inventory: InventoryAvailabilityService,
    private readonly pricing: PricingService,
    private readonly wallet: WalletService,
    private readonly mail: MailService,
    private readonly payments: PaymentsService,
    private readonly config: AppConfig,
  ) {}

  private isManager(actor: RequestUser) {
    return this.abilities.forUser(actor).can("manage", "Booking");
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async list(actor: RequestUser, query: BookingListQuery): Promise<Paginated<BookingRow>> {
    const ability = this.abilities.forUser(actor);
    const owner: Prisma.BookingWhereInput = query.owner === "me" ? { ownerId: actor.id } : query.owner === "unassigned" ? { ownerId: null } : query.owner ? { ownerId: query.owner } : {};
    const phone = query.q ? normalizePhone(query.q) : null;
    const where: Prisma.BookingWhereInput = {
      AND: [
        accessibleBy(ability).Booking,
        owner,
        query.status ? { status: query.status } : {},
        query.productType ? { productType: query.productType } : {},
        query.tripType ? { tripType: query.tripType } : {},
        query.customerId ? { customerId: query.customerId } : {},
        query.q
          ? {
              OR: [
                { refNo: { contains: query.q, mode: "insensitive" } },
                { destination: { contains: query.q, mode: "insensitive" } },
                { customer: { fullName: { contains: query.q, mode: "insensitive" } } },
                { customer: { phone: { contains: phone ?? query.q.replace(/\s/g, "") } } },
              ],
            }
          : {},
      ],
    };
    const canSeeCost = ability.can("manage", "Booking");
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({ where, include, orderBy: orderByFrom(query.sort, ["createdAt", "travelFrom"] as const, { createdAt: "desc" }), ...paginate(query.page, query.pageSize) }),
      this.prisma.booking.count({ where }),
    ]);
    return { data: rows.map((r) => toRow(r, canSeeCost)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(actor: RequestUser, id: string): Promise<BookingDetail> {
    const ability = this.abilities.forUser(actor);
    const booking = await this.findAccessible(actor, id, "read");
    const full = await this.prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include });
    return toDetail(full, ability.can("manage", "Booking"));
  }

  /** CSV export of the register, respecting the same filters and cost visibility as `list()`. Every page is exported. */
  async exportCsv(actor: RequestUser, query: BookingListQuery): Promise<string> {
    const header = ["Ref No", "Customer", "Product", "Trip type", "Status", "Destination", "Travel from", "Travel to", "Sell price", "Discount", "Owner", "Created"];
    const lines: string[] = [];
    for (let page = 1; lines.length < CSV_EXPORT_CAP; page++) {
      const { data, meta } = await this.list(actor, { ...query, page, pageSize: 100 });
      for (const b of data) {
        lines.push(csvRow([b.refNo, b.customer.fullName, b.productType, b.tripType, BOOKING_STATUS_LABELS[b.status], b.destination ?? "", b.travelFrom ?? "", b.travelTo ?? "", b.totalSell, b.discount, b.owner?.name ?? "Unassigned", b.createdAt.slice(0, 10)]));
      }
      if (page * 100 >= meta.total) break;
    }
    return CSV_BOM + [csvRow(header), ...lines].join("\r\n");
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  async create(actor: RequestUser, input: BookingData): Promise<BookingDetail> {
    const booking = await this.prisma.$transaction((tx) => this.createRecord(actor, input, tx));
    return this.get(actor, booking.id);
  }

  /**
   * Creates the booking inside the caller's transaction, so a flow that must be all-or-nothing (turning a quotation
   * into a booking) can do its own bookkeeping in the same transaction. Returns the raw row; read the detail after commit.
   */
  async createRecord(actor: RequestUser, input: BookingData, tx: Prisma.TransactionClient): Promise<Booking> {
    const ability = this.abilities.forUser(actor);
    const manager = ability.can("manage", "Booking");
    if (input.ownerId && input.ownerId !== actor.id && !manager) throw AppError.forbidden("Only managers can assign bookings to other people");

    await this.customers.findAccessible(actor, input.customerId, "read");
    let leadTripType: TripType | undefined;
    if (input.leadId) {
      const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
      if (!lead) throw AppError.notFound("Lead");
      if (!ability.can("read", subject("Lead", lead))) throw AppError.forbidden("You can't link a booking to a lead you can't see");
      leadTripType = lead.tripType;
    }
    if (input.travelerIds.length) await this.assertTravelersBelong(input.customerId, input.travelerIds);

    const priced = await Promise.all(input.items.map((item) => this.priceItem(item, input.productType, "B2C", manager)));
    const subtotal = priced.reduce((sum, i) => sum + i.sellPrice * i.quantity, 0);
    this.assertDiscount(subtotal, input.discount);

    const created = await tx.booking.create({
      data: {
        refNo: await this.sequences.next("booking", tx),
        customerId: input.customerId,
        leadId: input.leadId ?? null,
        productType: input.productType,
        // Carries the lead's trip type (FIT/Group Tour/Customized) forward when the booking wasn't given one directly.
        tripType: input.tripType ?? leadTripType ?? "FIT",
        destination: input.destination,
        travelFrom: fromDateOnly(input.travelFrom),
        travelTo: fromDateOnly(input.travelTo),
        notes: input.notes,
        source: input.source,
        discount: input.discount,
        ownerId: input.ownerId === undefined ? actor.id : input.ownerId,
        createdById: actor.id,
        totalCost: priced.reduce((sum, i) => sum + i.costPrice * i.quantity, 0),
        totalSell: subtotal - input.discount,
        travelers: input.travelerIds.length ? { connect: input.travelerIds.map((id) => ({ id })) } : undefined,
      },
    });
    for (const item of priced) await this.reserveAndCreateItem(tx, created.id, item);

    await this.activities.record({ entityType: "CUSTOMER", entityId: input.customerId, customerId: input.customerId, type: "SYSTEM", body: `Booking ${created.refNo} created`, actorId: actor.id }, tx);
    if (input.leadId) await this.advanceLeadForBooking(tx, input.leadId, created.refNo, actor.id);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.created", entityType: "Booking", entityId: created.id, after: created }, tx);
    return created;
  }

  /**
   * A B2B partner submitting a booking for Mashkoor to action. Starts at PENDING_APPROVAL, unassigned;
   * nothing is debited yet — that happens when an ops manager confirms it (see `changeStatus`).
   * The agency can't give itself a discount, can't attach someone else's lead, and a catalog package is always
   * priced from the catalog, never from what the agency typed.
   */
  async createForPartner(actor: RequestUser, input: BookingData): Promise<BookingDetail> {
    if (!actor.partnerId) throw AppError.forbidden();
    await this.customers.findAccessible(actor, input.customerId, "read");
    if (input.travelerIds.length) await this.assertTravelersBelong(input.customerId, input.travelerIds);
    if (input.items.length === 0) throw this.invalid("Add at least one item to the booking", "items");

    const priced = await Promise.all(
      input.items.map(async (item) => {
        if (item.type === "PACKAGE" && item.packageId) return this.priceCatalogPackage(item);
        const floored = await this.enforcePartnerFloor(await this.priceItem(item, input.productType, "B2B", false), input.productType);
        if (!floored.ratePeriodId && !floored.flightSeatBlockId && floored.sellPrice <= 0) throw this.invalid("Enter the price for each item", "items");
        return { ...floored, meta: floored.ratePeriodId || floored.flightSeatBlockId ? undefined : { partnerQuoted: true } };
      }),
    );
    const totalSell = priced.reduce((sum, i) => sum + i.sellPrice * i.quantity, 0);
    if (totalSell <= 0) throw this.invalid("The booking total must be above zero", "items");
    if (!(await this.wallet.canAfford(actor.partnerId, totalSell))) throw AppError.conflict("This booking exceeds the agency's available balance and credit limit");

    // A lead can only be one this agency raised itself.
    const leadId = input.leadId ? (await this.prisma.lead.findFirst({ where: { id: input.leadId, partnerId: actor.partnerId }, select: { id: true } }))?.id ?? null : null;

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          refNo: await this.sequences.next("booking", tx),
          customerId: input.customerId,
          leadId,
          productType: input.productType,
          tripType: input.tripType ?? "FIT",
          destination: input.destination,
          travelFrom: fromDateOnly(input.travelFrom),
          travelTo: fromDateOnly(input.travelTo),
          notes: input.notes,
          source: "B2B",
          partnerId: actor.partnerId,
          discount: 0,
          status: "PENDING_APPROVAL",
          ownerId: null,
          createdById: actor.id,
          totalCost: priced.reduce((sum, i) => sum + i.costPrice * i.quantity, 0),
          totalSell,
          travelers: input.travelerIds.length ? { connect: input.travelerIds.map((id) => ({ id })) } : undefined,
        },
      });
      for (const item of priced) await this.reserveAndCreateItem(tx, created.id, item);
      await this.activities.record({ entityType: "CUSTOMER", entityId: input.customerId, customerId: input.customerId, type: "SYSTEM", body: `B2B booking ${created.refNo} submitted for approval`, actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.created", entityType: "Booking", entityId: created.id, after: created }, tx);
      return created;
    });
    const partnerName = (await this.prisma.partner.findUnique({ where: { id: actor.partnerId }, select: { companyName: true } }))?.companyName ?? "A partner";
    await this.mail.sendToStaff(["OPS_MANAGER", "SUPER_ADMIN"], () =>
      emails.bookingSubmittedToStaff({ partnerName, bookingRef: booking.refNo, total: booking.totalSell, url: `${this.config.get("APP_URL")}/admin/bookings/${booking.id}` }),
    );
    return this.get(actor, booking.id);
  }

  async update(actor: RequestUser, id: string, input: BookingUpdateData): Promise<BookingDetail> {
    const before = await this.findAccessible(actor, id, "update");
    const manager = this.isManager(actor);
    if (CLOSED.includes(before.status)) throw AppError.conflict("This booking is closed, so it can't be edited");
    if (input.travelerIds) await this.assertTravelersBelong(before.customerId, input.travelerIds);
    if (input.ownerId !== undefined && input.ownerId !== before.ownerId) {
      if (!manager) throw AppError.forbidden("Only managers can reassign a booking");
      if (input.ownerId && !(await this.prisma.user.findFirst({ where: { id: input.ownerId, type: "STAFF", status: "ACTIVE" }, select: { id: true } }))) throw AppError.notFound("Assignee");
    }

    const nextFrom = input.travelFrom === undefined ? before.travelFrom : fromDateOnly(input.travelFrom);
    const nextTo = input.travelTo === undefined ? before.travelTo : fromDateOnly(input.travelTo);
    if (nextFrom && nextTo && nextTo < nextFrom) throw this.invalid("Return must be after departure", "travelTo");

    let totalSell = before.totalSell;
    if (input.discount !== undefined && input.discount !== before.discount) {
      // Once the booking is in progress money and supplier commitments hang off its total, so the price is frozen.
      if (!PRE_PROGRESS.includes(before.status)) throw AppError.conflict("The discount can only change before the booking is in progress");
      const subtotal = before.totalSell + before.discount;
      this.assertDiscount(subtotal, input.discount);
      totalSell = subtotal - input.discount;
    }

    await this.prisma.booking.update({
      where: { id },
      data: {
        destination: input.destination,
        travelFrom: input.travelFrom === undefined ? undefined : fromDateOnly(input.travelFrom),
        travelTo: input.travelTo === undefined ? undefined : fromDateOnly(input.travelTo),
        notes: input.notes,
        discount: input.discount,
        totalSell,
        ownerId: input.ownerId,
        travelers: input.travelerIds ? { set: input.travelerIds.map((tid) => ({ id: tid })) } : undefined,
      },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.updated", entityType: "Booking", entityId: id, before, after: input });
    return this.get(actor, id);
  }

  /** Adds one item to a booking already created, reserving its inventory. Used to build up a booking step by step. */
  async addItem(actor: RequestUser, bookingId: string, input: BookingItemData): Promise<BookingDetail> {
    const booking = await this.findAccessible(actor, bookingId, "update");
    this.assertEditable(booking);
    const priced = await this.priceItem(input, booking.productType, booking.partnerId ? "B2B" : "B2C", this.isManager(actor));

    await this.prisma.$transaction(async (tx) => {
      await this.reserveAndCreateItem(tx, bookingId, priced);
      await tx.booking.update({
        where: { id: bookingId },
        data: { totalCost: { increment: priced.costPrice * priced.quantity }, totalSell: { increment: priced.sellPrice * priced.quantity } },
      });
    });
    return this.get(actor, bookingId);
  }

  async removeItem(actor: RequestUser, bookingId: string, itemId: string): Promise<BookingDetail> {
    const booking = await this.findAccessible(actor, bookingId, "update");
    this.assertEditable(booking);
    const item = await this.prisma.bookingItem.findUnique({ where: { id: itemId } });
    if (!item || item.bookingId !== bookingId) throw AppError.notFound("Booking item");

    await this.prisma.$transaction(async (tx) => {
      await this.releaseItem(tx, item);
      await tx.bookingItem.delete({ where: { id: itemId } });
      const subtotal = booking.totalSell + booking.discount - item.sellPrice * item.quantity;
      // Removing an item must never leave a discount bigger than what's left to discount.
      await tx.booking.update({ where: { id: bookingId }, data: { totalCost: { decrement: item.costPrice * item.quantity }, totalSell: Math.max(0, subtotal - booking.discount), discount: Math.min(booking.discount, Math.max(0, subtotal)) } });
    });
    return this.get(actor, bookingId);
  }

  /** Corrects a line's wording or price (the quantity and inventory link stay as booked) and re-totals the booking. */
  async updateItem(actor: RequestUser, bookingId: string, itemId: string, input: BookingItemUpdateData): Promise<BookingDetail> {
    const booking = await this.findAccessible(actor, bookingId, "update");
    this.assertEditable(booking);
    const item = await this.prisma.bookingItem.findUnique({ where: { id: itemId } });
    if (!item || item.bookingId !== bookingId) throw AppError.notFound("Booking item");
    const manager = this.isManager(actor);
    if (input.costPrice !== undefined && !manager) throw AppError.forbidden("Only managers can change a cost price");

    const costPrice = input.costPrice !== undefined && !item.ratePeriodId && !item.flightSeatBlockId ? input.costPrice : item.costPrice;
    const sellPrice = input.sellPrice ?? item.sellPrice;
    const subtotal = booking.totalSell + booking.discount + (sellPrice - item.sellPrice) * item.quantity;
    this.assertDiscount(subtotal, booking.discount);

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingItem.update({ where: { id: itemId }, data: { description: input.description, costPrice, sellPrice, meta: item.meta && (item.meta as { partnerQuoted?: boolean }).partnerQuoted ? { partnerQuoted: false } : undefined } });
      await tx.booking.update({ where: { id: bookingId }, data: { totalCost: { increment: (costPrice - item.costPrice) * item.quantity }, totalSell: subtotal - booking.discount } });
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.item_updated", entityType: "Booking", entityId: bookingId, before: { sellPrice: item.sellPrice, costPrice: item.costPrice }, after: { sellPrice, costPrice } }, tx);
    });
    return this.get(actor, bookingId);
  }

  /** Moves the booking to a new status, following the allowed-transition map; releases inventory on cancel/fail. */
  async changeStatus(actor: RequestUser, id: string, change: BookingStatusChange): Promise<BookingDetail> {
    const booking = await this.findAccessible(actor, id, "update");
    if (booking.status === change.status) return this.get(actor, id);
    const allowed = BOOKING_STATUS_TRANSITIONS[booking.status];
    if (!allowed.includes(change.status)) {
      throw AppError.conflict(`A booking can't move from ${BOOKING_STATUS_LABELS[booking.status]} to ${BOOKING_STATUS_LABELS[change.status]}`);
    }
    if (!this.isManager(actor) && !(SALES_TRANSITIONS[booking.status] ?? []).includes(change.status)) {
      throw AppError.forbidden(`Only a manager can move a booking to ${BOOKING_STATUS_LABELS[change.status]}. Use "Request cancellation" to ask for a cancellation.`);
    }
    await this.applyStatus(actor, booking, change);
    return this.get(actor, id);
  }

  private async applyStatus(actor: RequestUser, booking: Booking, change: BookingStatusChange) {
    const releasing = change.status === "CANCELLED" || change.status === "FAILED";
    const reopening = booking.status === "FAILED" && change.status === "INQUIRY";
    await this.prisma.$transaction(async (tx) => {
      const items = await tx.bookingItem.findMany({ where: { bookingId: booking.id } });
      if (releasing) for (const item of items) await this.releaseItem(tx, item);
      // A failed booking gave its seats back; reopening it has to take them again (or say why it can't).
      if (reopening) for (const item of items) await this.holdItem(tx, item);
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: change.status,
          cancelledAt: change.status === "CANCELLED" ? new Date() : undefined,
          cancelReason: releasing ? change.reason : undefined,
          cancellationFee: change.status === "CANCELLED" ? Math.min(change.cancellationFee, booking.totalSell) : undefined,
          // Cancelling answers any pending cancellation request.
          ...(change.status === "CANCELLED" ? { cancelRequestedAt: null, cancelRequestReason: null } : {}),
        },
      });
      if (change.status === "CONFIRMED" && booking.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: booking.leadId } });
        if (lead && lead.stage !== "WON") {
          await tx.lead.update({ where: { id: lead.id }, data: { stage: "WON", stageChangedAt: new Date(), wonBookingId: booking.id, lostReason: null, nextFollowUpAt: null } });
          await this.activities.record({ entityType: "LEAD", entityId: lead.id, customerId: lead.customerId, type: "STAGE_CHANGE", body: `Won — booking ${booking.refNo} confirmed`, meta: { from: lead.stage, to: "WON", bookingId: booking.id }, actorId: actor.id }, tx);
        }
      }
      // B2B money movement: confirming debits the agency's wallet; cancelling a confirmed booking refunds it (less any fee).
      if (booking.partnerId && change.status === "CONFIRMED") {
        await this.wallet.debit(tx, booking.partnerId, booking.totalSell, { referenceType: "Booking", referenceId: booking.id, note: booking.refNo });
      }
      if (booking.partnerId && booking.status === "CONFIRMED" && change.status === "CANCELLED") {
        const refundAmount = booking.totalSell - Math.min(change.cancellationFee, booking.totalSell);
        if (refundAmount > 0) await this.wallet.refund(tx, booking.partnerId, refundAmount, { referenceType: "Booking", referenceId: booking.id, note: `Cancelled ${booking.refNo}` });
      }
      const body = `${BOOKING_STATUS_LABELS[booking.status]} → ${BOOKING_STATUS_LABELS[change.status]}${change.reason ? ` — ${change.reason}` : ""}`;
      await this.activities.record({ entityType: "CUSTOMER", entityId: booking.customerId, customerId: booking.customerId, type: "STATUS_CHANGE", body: `Booking ${booking.refNo}: ${body}`, actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.status_changed", entityType: "Booking", entityId: booking.id, before: { status: booking.status }, after: { status: change.status } }, tx);
    });
    await this.notifyStatusChange(booking, change.status, change.reason ?? null);
  }

  /**
   * Someone who can't cancel outright asks for a cancellation: a partner (before work starts this simply cancels; after
   * that it becomes a request) or a salesperson (anything beyond a plain inquiry/quote is a request for a manager).
   */
  async requestCancellation(actor: RequestUser, id: string, reason: string): Promise<BookingDetail> {
    const booking = await this.findAccessible(actor, id, "update");
    const manager = this.isManager(actor);
    const partner = actor.portal === "b2b";
    if (CLOSED.includes(booking.status)) throw AppError.conflict("This booking can no longer be cancelled");
    if ((manager || partner) && PRE_PROGRESS.includes(booking.status)) {
      await this.applyStatus(actor, booking, { status: "CANCELLED", reason, cancellationFee: 0 });
      return this.get(actor, id);
    }
    if (!manager && !partner && (SALES_TRANSITIONS[booking.status] ?? []).includes("CANCELLED")) {
      await this.applyStatus(actor, booking, { status: "CANCELLED", reason, cancellationFee: 0 });
      return this.get(actor, id);
    }
    if (booking.cancelRequestedAt) throw AppError.conflict("A cancellation has already been requested");

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { cancelRequestedAt: new Date(), cancelRequestReason: reason } });
      await this.activities.record({ entityType: "CUSTOMER", entityId: booking.customerId, customerId: booking.customerId, type: "SYSTEM", body: `Cancellation requested for ${booking.refNo}: ${reason}`, actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.cancel_requested", entityType: "Booking", entityId: id, after: { reason } }, tx);
    });
    const requester = partner
      ? (await this.prisma.partner.findUnique({ where: { id: booking.partnerId ?? "" }, select: { companyName: true } }))?.companyName ?? "A partner"
      : `${(await this.prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }))?.name ?? "A team member"} (sales)`;
    await this.mail.sendToStaff(["OPS_MANAGER", "SUPER_ADMIN"], () =>
      emails.cancelRequestToStaff({ partnerName: requester, bookingRef: booking.refNo, reason, url: `${this.config.get("APP_URL")}/admin/bookings/${id}` }),
    );
    return this.get(actor, id);
  }

  /** A manager turns down a cancellation request; the booking carries on and the requester is told. */
  async declineCancellationRequest(actor: RequestUser, id: string, note: string | null): Promise<BookingDetail> {
    if (!this.isManager(actor)) throw AppError.forbidden("Only managers can decline a cancellation request");
    const booking = await this.findAccessible(actor, id, "update");
    if (!booking.cancelRequestedAt) throw AppError.conflict("There is no cancellation request on this booking");
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { cancelRequestedAt: null, cancelRequestReason: null } });
      await this.activities.record({ entityType: "CUSTOMER", entityId: booking.customerId, customerId: booking.customerId, type: "SYSTEM", body: `Cancellation request for ${booking.refNo} was declined${note ? `: ${note}` : ""}`, actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.cancel_request_declined", entityType: "Booking", entityId: id, after: { note } }, tx);
    });
    const to = booking.partnerId
      ? await this.prisma.partner.findUnique({ where: { id: booking.partnerId }, select: { contactName: true, email: true } }).then((p) => (p ? { email: p.email, name: p.contactName } : null))
      : booking.ownerId
        ? await this.prisma.user.findUnique({ where: { id: booking.ownerId }, select: { name: true, email: true } })
        : null;
    if (to) {
      await this.mail.send({
        to: to.email,
        toName: to.name,
        subject: `Cancellation request declined — ${booking.refNo}`,
        text: `The cancellation request for booking ${booking.refNo} was not approved, so the booking stays active.${note ? `\n\nNote from the team: ${note}` : ""}`,
        entityType: "Booking",
        entityId: id,
      });
    }
    return this.get(actor, id);
  }

  /** Emails the customer (or, for partner bookings, the agency) when a booking is confirmed or cancelled. */
  private async notifyStatusChange(booking: Booking, status: string, reason: string | null) {
    if (status !== "CONFIRMED" && status !== "CANCELLED") return;
    const [customer, partner] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: booking.customerId }, select: { fullName: true, email: true } }),
      booking.partnerId ? this.prisma.partner.findUnique({ where: { id: booking.partnerId }, select: { contactName: true, email: true } }) : null,
    ]);
    const to = partner ? { email: partner.email, name: partner.contactName } : customer?.email ? { email: customer.email, name: customer.fullName } : null;
    if (!to) return;
    const balanceDue = Math.max(0, await this.payments.computeBalance(booking.id));
    const built =
      status === "CONFIRMED"
        ? emails.bookingConfirmed({ customerName: to.name, bookingRef: booking.refNo, destination: booking.destination, travelFrom: toDateOnly(booking.travelFrom), totalSell: booking.totalSell, balanceDue: partner ? 0 : balanceDue })
        : emails.bookingCancelled({ customerName: to.name, bookingRef: booking.refNo, reason });
    await this.mail.send({ ...built, to: to.email, toName: to.name, dedupeKey: `booking:${booking.id}:${status}`, entityType: "Booking", entityId: booking.id });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private invalid(message: string, field = "_") {
    return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_FAILED, message, { fieldErrors: { [field]: message } });
  }

  private assertEditable(booking: Booking) {
    if (!PRE_PROGRESS.includes(booking.status)) throw AppError.conflict("Items can only be changed before a booking is in progress");
  }

  /** A discount can bring a booking down to nothing, never below it. */
  private assertDiscount(subtotal: number, discount: number) {
    if (discount > subtotal) throw this.invalid("The discount can't be more than the booking total", "discount");
  }

  /** Whether an item takes seats or rooms from inventory. */
  private linked(item: { ratePeriodId?: string | null; flightSeatBlockId?: string | null; packageDepartureId?: string | null }) {
    return Boolean(item.ratePeriodId || item.flightSeatBlockId || item.packageDepartureId);
  }

  /** Reserves the item's inventory again if it was released (reopening a failed booking). Fails with a clear message if it's gone. */
  private async holdItem(tx: Prisma.TransactionClient, item: BookingItem) {
    if (item.held || !this.linked(item)) return;
    try {
      if (item.ratePeriodId) await this.inventory.reserveRooms(tx, item.ratePeriodId, item.quantity);
      if (item.flightSeatBlockId) await this.inventory.reserveSeats(tx, item.flightSeatBlockId, item.quantity);
      if (item.packageDepartureId) await this.inventory.reserveDeparture(tx, item.packageDepartureId, item.quantity);
    } catch (error) {
      if (error instanceof AppError && error.getStatus() === HttpStatus.CONFLICT) throw AppError.conflict(`This booking can't be reopened: ${error.message.toLowerCase()}`);
      throw error;
    }
    await tx.bookingItem.update({ where: { id: item.id }, data: { held: true } });
  }

  /** Gives the item's inventory back — once. The `held` flag makes a second release a no-op. */
  private async releaseItem(tx: Prisma.TransactionClient, item: BookingItem) {
    if (!item.held || !this.linked(item)) return;
    if (item.ratePeriodId) await this.inventory.releaseRooms(tx, item.ratePeriodId, item.quantity);
    if (item.flightSeatBlockId) await this.inventory.releaseSeats(tx, item.flightSeatBlockId, item.quantity);
    if (item.packageDepartureId) await this.inventory.releaseDeparture(tx, item.packageDepartureId, item.quantity);
    await tx.bookingItem.update({ where: { id: item.id }, data: { held: false } });
  }

  /**
   * Fills in the item's real prices. The cost of a room or seat always comes from the inventory record — never from the
   * request — and anyone who can't see cost can't set it. A sell price of 0 means "use the pricing rule", but only when
   * there is a cost to mark up: a free line (complimentary transfer) stays free.
   */
  private async priceItem(item: BookingItemData, productType: BookingData["productType"], scope: "B2C" | "B2B", canSetCost: boolean): Promise<BookingItemData> {
    let costPrice = canSetCost ? item.costPrice : 0;
    if (item.ratePeriodId) {
      const period = await this.prisma.ratePeriod.findUnique({ where: { id: item.ratePeriodId }, select: { costPrice: true } });
      if (!period) throw AppError.notFound("Rate period");
      costPrice = period.costPrice;
    } else if (item.flightSeatBlockId) {
      const block = await this.prisma.flightSeatBlock.findUnique({ where: { id: item.flightSeatBlockId }, select: { costPrice: true } });
      if (!block) throw AppError.notFound("Flight seat block");
      costPrice = block.costPrice;
    }
    if (item.sellPrice > 0 || costPrice === 0) return { ...item, costPrice };
    return { ...item, costPrice, sellPrice: await this.pricing.suggestSellPrice(scope, productType, costPrice) };
  }

  /** A catalog package is sold at the catalog's lowest per-person price, whatever the agency typed. */
  private async priceCatalogPackage(item: BookingItemData): Promise<BookingItemData> {
    const pkg = await this.prisma.package.findFirst({ where: { id: item.packageId!, published: true }, select: { priceTiers: true } });
    if (!pkg) throw AppError.notFound("Package");
    const tiers = ((pkg.priceTiers as unknown as PackagePriceTier[]) ?? []).filter((t) => Number(t.adultPrice) > 0);
    if (tiers.length === 0) throw this.invalid("This package has no published price yet — send an enquiry instead", "items");
    return { ...item, costPrice: 0, sellPrice: Math.min(...tiers.map((t) => Number(t.adultPrice))) };
  }

  /**
   * A partner picks rooms and seats from live inventory but must not be able to name their own price for them:
   * the cost is never below what the inventory record says, and the sell price never below the B2B rule's price for
   * that cost. (Free-text lines with no inventory behind them are flagged "partner-quoted" for staff to check on approval.)
   */
  private async enforcePartnerFloor(item: BookingItemData, productType: BookingData["productType"]): Promise<BookingItemData> {
    if (!item.ratePeriodId && !item.flightSeatBlockId) return item;
    const sellPrice = Math.max(item.sellPrice, await this.pricing.suggestSellPrice("B2B", productType, item.costPrice));
    return { ...item, sellPrice };
  }

  private async reserveAndCreateItem(tx: Prisma.TransactionClient, bookingId: string, item: BookingItemData & { meta?: Prisma.InputJsonValue }) {
    if (item.ratePeriodId) await this.inventory.reserveRooms(tx, item.ratePeriodId, item.quantity);
    if (item.flightSeatBlockId) await this.inventory.reserveSeats(tx, item.flightSeatBlockId, item.quantity);
    await tx.bookingItem.create({
      data: {
        bookingId,
        type: item.type,
        description: item.description,
        packageId: item.packageId ?? null,
        flightSeatBlockId: item.flightSeatBlockId ?? null,
        ratePeriodId: item.ratePeriodId ?? null,
        quantity: item.quantity,
        costPrice: item.costPrice,
        sellPrice: item.sellPrice,
        held: true,
        meta: item.meta,
      },
    });
  }

  /**
   * A booking made from a lead moves that lead on: once there's a booking, the lead is waiting for payment (it turns
   * Won when the booking is confirmed). Leads that are already won or lost are left alone.
   */
  private async advanceLeadForBooking(tx: Prisma.TransactionClient, leadId: string, bookingRef: string, actorId: string) {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead || !["NEW", "CONTACTED", "QUOTATION"].includes(lead.stage)) return;
    await tx.lead.update({ where: { id: lead.id }, data: { stage: "WAITING_PAYMENT", stageChangedAt: new Date() } });
    await this.activities.record({ entityType: "LEAD", entityId: lead.id, customerId: lead.customerId, type: "STAGE_CHANGE", body: `Booking ${bookingRef} created — waiting for payment`, meta: { from: lead.stage, to: "WAITING_PAYMENT" }, actorId }, tx);
  }

  private async assertTravelersBelong(customerId: string, travelerIds: string[]) {
    const count = await this.prisma.traveler.count({ where: { id: { in: travelerIds }, customerId } });
    if (count !== travelerIds.length) throw AppError.conflict("One or more travellers don't belong to this customer");
  }

  /** Prisma filter for the bookings this actor may read — for modules that list things attached to bookings. */
  accessibleWhere(actor: RequestUser): Prisma.BookingWhereInput {
    return accessibleBy(this.abilities.forUser(actor), "read").Booking;
  }

  /** The single permission check for "may this person see / change this booking" — other modules reuse it. */
  async findAccessible(actor: RequestUser, id: string, action: "read" | "update" | "attach" | "notify" | "collect") {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw AppError.notFound("Booking");
    if (!this.abilities.forUser(actor).can(action, subject("Booking", booking))) throw AppError.forbidden();
    return booking;
  }
}
