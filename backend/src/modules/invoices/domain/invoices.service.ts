import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import {
  itineraryLineSchema,
  itineraryTotal,
  lineTotal,
  type InvoiceData,
  type InvoiceDetail,
  type InvoiceLine,
  type InvoiceListQuery,
  type InvoicePaymentState,
  type InvoicePrefill,
  type InvoiceRow,
  type InvoiceUpdateData,
  type ItineraryLine,
  type ItineraryLineKind,
  type Paginated,
} from "@mashkoor/shared";
import type { BookingItemType, Prisma } from "@prisma/client";
import { fromDateOnly, toDateOnly, toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { ActivitiesService } from "../../activities/domain/activities.service";

const include = {
  booking: { select: { id: true, refNo: true, productType: true } },
  customer: { select: { id: true, refNo: true, fullName: true, email: true } },
  lead: { select: { id: true, refNo: true } },
  payments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.InvoiceInclude;
type InvoiceWithRefs = Prisma.InvoiceGetPayload<{ include: typeof include }>;

/** Reads the lines of any invoice. Ones raised before the builder existed only have a description, quantity and price. */
const normalizeLines = (raw: unknown): InvoiceLine[] =>
  (Array.isArray(raw) ? raw : []).map((item) => {
    const parsed = itineraryLineSchema.safeParse(item);
    if (parsed.success) return parsed.data;
    const o = (item ?? {}) as { description?: unknown; quantity?: unknown; unitPrice?: unknown };
    return { kind: "OTHER", description: String(o.description ?? "Item"), detail: null, quantity: Math.max(1, Number(o.quantity) || 1), unitPrice: Math.max(0, Math.round(Number(o.unitPrice) || 0)), currency: "INR", foreignAmount: null, fxRate: null, discount: 0, taxPercent: 0 } satisfies ItineraryLine;
  });

/** The kind of booking item a quotation line becomes when a booking is created behind a stand-alone invoice. */
const ITEM_TYPE: Record<ItineraryLineKind, BookingItemType> = { FLIGHT: "FLIGHT", HOTEL: "HOTEL", VISA: "VISA", MEALS: "OTHER", TRANSPORT: "OTHER", OTHER: "OTHER" };

const paidOf = (i: InvoiceWithRefs) => i.payments.filter((p) => p.status === "VERIFIED").reduce((sum, p) => sum + (p.direction === "COLLECTION" ? p.amount : -p.amount), 0);

const stateOf = (i: InvoiceWithRefs, paid: number): InvoicePaymentState => (i.status === "CANCELLED" ? "CANCELLED" : i.total > 0 && paid >= i.total ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID");

const toRow = (i: InvoiceWithRefs): InvoiceRow => {
  const paid = paidOf(i);
  return {
    id: i.id,
    refNo: i.refNo,
    state: stateOf(i, paid),
    booking: i.booking,
    customer: { id: i.customer.id, refNo: i.customer.refNo, fullName: i.customer.fullName },
    issueDate: toDateOnly(i.issueDate)!,
    dueDate: toDateOnly(i.dueDate),
    total: i.total,
    paid,
    balance: i.status === "CANCELLED" ? 0 : Math.max(0, i.total - paid),
    sentAt: toIso(i.sentAt),
    createdAt: toIso(i.createdAt)!,
  };
};

const toDetail = (i: InvoiceWithRefs): InvoiceDetail => ({
  ...toRow(i),
  lines: normalizeLines(i.lines),
  adjustment: i.adjustment,
  subject: i.subject,
  notes: i.notes,
  terms: i.terms,
  itineraryId: i.itineraryId,
  ownsBooking: i.ownsBooking,
  productType: i.booking.productType,
  linesLocked: i.payments.some((p) => p.status !== "REJECTED"),
  lead: i.lead,
  customerEmail: i.customer.email,
  payments: i.payments.map((p) => ({ id: p.id, receiptNo: p.receiptNo, direction: p.direction, method: p.method, amount: p.amount, status: p.status, reference: p.reference, createdAt: toIso(p.createdAt)! })),
});

const inr = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

/**
 * Invoices. The accountant raises one from a booking — the accepted quotation's lines, copied — sends it to the
 * customer and records each payment against it. Paid and balance are never stored: they are worked out from the
 * verified payments, so the invoice can't drift out of step with the ledger.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly activities: ActivitiesService,
    private readonly mail: MailService,
  ) {}

  async list(actor: RequestUser, query: InvoiceListQuery): Promise<Paginated<InvoiceRow>> {
    const ability = this.abilities.forUser(actor);
    const q = query.q;
    const where: Prisma.InvoiceWhereInput = {
      AND: [
        accessibleBy(ability).Invoice,
        query.customerId ? { customerId: query.customerId } : {},
        query.bookingId ? { bookingId: query.bookingId } : {},
        q ? { OR: [{ refNo: { contains: q, mode: "insensitive" } }, { customer: { fullName: { contains: q, mode: "insensitive" } } }, { booking: { refNo: { contains: q, mode: "insensitive" } } }] } : {},
      ],
    };
    // Paid / unpaid is derived from payments, so filter after loading — invoice volumes are small.
    const all = (await this.prisma.invoice.findMany({ where, include, orderBy: { createdAt: "desc" }, take: 1000 })).map(toRow);
    const rows = query.state ? all.filter((r) => r.state === query.state) : all;
    const start = (query.page - 1) * query.pageSize;
    return { data: rows.slice(start, start + query.pageSize), meta: { page: query.page, pageSize: query.pageSize, total: rows.length } };
  }

  async get(actor: RequestUser, id: string): Promise<InvoiceDetail> {
    await this.findAccessible(actor, id, "read");
    return this.detail(id);
  }

  /**
   * Raises an invoice. Against an existing booking it takes the booking's customer (and, unless lines are given, its items).
   * With just a customer it is written from scratch: a booking is created behind it so payments, receivables and the
   * accounts screens work exactly as they do for any other sale.
   */
  async create(actor: RequestUser, input: InvoiceData): Promise<InvoiceDetail> {
    const ability = this.abilities.forUser(actor);
    const booking = input.bookingId ? await this.prisma.booking.findUnique({ where: { id: input.bookingId }, include: { items: true } }) : null;
    if (input.bookingId && !booking) throw AppError.notFound("Booking");
    if (booking) {
      if (!ability.can("read", subject("Booking", booking))) throw AppError.forbidden();
      if (booking.status === "CANCELLED" || booking.status === "FAILED") throw AppError.conflict("This booking is cancelled, so it can't be invoiced");
      const existing = await this.prisma.invoice.findFirst({ where: { bookingId: booking.id, status: "ISSUED" }, select: { refNo: true } });
      if (existing) throw AppError.conflict(`This booking already has invoice ${existing.refNo}. Cancel it first to raise a new one.`);
    }
    const customerId = booking?.customerId ?? input.customerId!;
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
    if (!customer) throw AppError.notFound("Customer");

    const fromBooking: ItineraryLine[] = booking
      ? booking.items.map((item) => ({ kind: "OTHER" as const, description: item.description, detail: null, quantity: item.quantity, unitPrice: item.sellPrice, currency: "INR", foreignAmount: null, fxRate: null, discount: 0, taxPercent: 0 }))
      : [];
    const given = input.lines && input.lines.length > 0;
    const lines = given ? input.lines! : fromBooking;
    if (lines.length === 0) throw AppError.conflict("This booking has no priced items to invoice");
    const adjustment = given ? input.adjustment : -(booking?.discount ?? 0);
    const total = itineraryTotal(lines, adjustment);
    const itineraryId = input.itineraryId ?? (booking ? ((await this.prisma.itinerary.findFirst({ where: { convertedBookingId: booking.id }, select: { id: true } }))?.id ?? null) : null);

    const created = await this.prisma.$transaction(async (tx) => {
      let bookingId = booking?.id;
      let leadId = booking?.leadId ?? null;
      let ownsBooking = false;
      if (!bookingId) {
        const made = await tx.booking.create({
          data: {
            refNo: await this.sequences.next("booking", tx),
            customerId,
            productType: input.productType,
            status: "PENDING_PAYMENT",
            totalSell: total,
            discount: Math.max(0, -adjustment),
            ownerId: actor.id,
            createdById: actor.id,
            notes: input.subject ?? undefined,
            items: { create: this.bookingItems(lines) },
          },
        });
        bookingId = made.id;
        ownsBooking = true;
      }
      if (input.itineraryId && !leadId) leadId = (await tx.itinerary.findUnique({ where: { id: input.itineraryId }, select: { leadId: true } }))?.leadId ?? null;
      const invoice = await tx.invoice.create({
        data: {
          refNo: await this.sequences.next("invoice", tx),
          bookingId,
          customerId,
          leadId,
          itineraryId,
          issueDate: fromDateOnly(input.issueDate) ?? undefined,
          dueDate: fromDateOnly(input.dueDate) ?? null,
          lines: lines as unknown as Prisma.InputJsonValue,
          adjustment,
          total,
          subject: input.subject,
          notes: input.notes,
          terms: input.terms,
          ownsBooking,
          createdById: actor.id,
        },
      });
      const note = `Invoice ${invoice.refNo} raised for ${inr(total)}`;
      if (leadId) await this.activities.record({ entityType: "LEAD", entityId: leadId, customerId, type: "SYSTEM", body: note, actorId: actor.id }, tx);
      else await this.activities.record({ entityType: "CUSTOMER", entityId: customerId, customerId, type: "SYSTEM", body: note, actorId: actor.id }, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "invoice.created", entityType: "Invoice", entityId: invoice.id, after: { refNo: invoice.refNo, total, bookingId, ownsBooking } }, tx);
      return invoice;
    });
    return this.detail(created.id);
  }

  /**
   * Edits an invoice that is still open. Once any payment is recorded against it the priced lines are fixed — what the customer
   * paid towards must not change underneath them — and only the wording, dates and terms can still be edited.
   */
  async update(actor: RequestUser, id: string, input: InvoiceUpdateData): Promise<InvoiceDetail> {
    const invoice = await this.findAccessible(actor, id, "update");
    if (invoice.status === "CANCELLED") throw AppError.conflict("This invoice has been cancelled");
    const paymentsRecorded = (await this.prisma.payment.count({ where: { invoiceId: id, status: { not: "REJECTED" } } })) > 0;
    const changesMoney = input.lines !== undefined || input.adjustment !== undefined;
    if (paymentsRecorded && changesMoney) throw AppError.conflict("Payments are recorded against this invoice, so its lines and total can't change. Cancel the payments first, or raise a new invoice.");
    if (input.lines !== undefined && input.lines.length === 0) throw AppError.conflict("An invoice needs at least one line");

    const lines = input.lines ?? normalizeLines(invoice.lines);
    const adjustment = input.adjustment ?? invoice.adjustment;
    const total = itineraryTotal(lines, adjustment);

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          ...(input.lines !== undefined ? { lines: lines as unknown as Prisma.InputJsonValue } : {}),
          adjustment,
          total,
          ...(input.subject !== undefined ? { subject: input.subject } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.terms !== undefined ? { terms: input.terms } : {}),
          ...(input.issueDate ? { issueDate: fromDateOnly(input.issueDate) ?? undefined } : {}),
          ...(input.dueDate !== undefined ? { dueDate: fromDateOnly(input.dueDate) ?? null } : {}),
        },
      });
      // A booking created only to carry this invoice follows it.
      if (invoice.ownsBooking && changesMoney) {
        await tx.bookingItem.deleteMany({ where: { bookingId: invoice.bookingId } });
        await tx.booking.update({ where: { id: invoice.bookingId }, data: { totalSell: total, discount: Math.max(0, -adjustment), items: { create: this.bookingItems(lines) } } });
      }
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "invoice.updated", entityType: "Invoice", entityId: id, before: { total: invoice.total }, after: { total } }, tx);
    });
    return this.detail(id);
  }

  /** What the invoice editor starts from: the lines of a quotation, or the items of a booking, with the customer they belong to. */
  async prefill(actor: RequestUser, source: { bookingId?: string; quotationId?: string }): Promise<InvoicePrefill> {
    const ability = this.abilities.forUser(actor);
    if (source.quotationId) {
      const it = await this.prisma.itinerary.findUnique({ where: { id: source.quotationId }, include: { customer: { select: { id: true, refNo: true, fullName: true } } } });
      if (!it) throw AppError.notFound("Quotation");
      if (!ability.can("read", subject("Itinerary", it))) throw AppError.forbidden();
      if (!it.customer) throw AppError.conflict("This quotation has no customer yet. Choose one on the quotation first.");
      return {
        bookingId: it.convertedBookingId,
        itineraryId: it.id,
        customer: it.customer,
        productType: it.productType,
        subject: it.title,
        lines: normalizeLines(it.lines),
        adjustment: it.adjustment,
        notes: it.quoteNotes,
        terms: it.terms,
      };
    }
    if (source.bookingId) {
      const booking = await this.prisma.booking.findUnique({ where: { id: source.bookingId }, include: { items: true, customer: { select: { id: true, refNo: true, fullName: true } } } });
      if (!booking) throw AppError.notFound("Booking");
      if (!ability.can("read", subject("Booking", booking))) throw AppError.forbidden();
      const itinerary = await this.prisma.itinerary.findFirst({ where: { convertedBookingId: booking.id } });
      return {
        bookingId: booking.id,
        itineraryId: itinerary?.id ?? null,
        customer: booking.customer,
        productType: booking.productType,
        subject: itinerary?.title ?? booking.destination,
        // The quotation's own lines when the booking came from one — they carry the details; otherwise the booking's items.
        lines: itinerary
          ? normalizeLines(itinerary.lines)
          : booking.items.map((item) => ({ kind: "OTHER" as const, description: item.description, detail: null, quantity: item.quantity, unitPrice: item.sellPrice, currency: "INR", foreignAmount: null, fxRate: null, discount: 0, taxPercent: 0 })),
        adjustment: itinerary ? itinerary.adjustment : -booking.discount,
        notes: null,
        terms: itinerary?.terms ?? null,
      };
    }
    throw AppError.conflict("Say which booking or quotation to start from");
  }

  /** Booking items for a set of invoice lines: the line's total spread over its quantity, with no inventory held. */
  private bookingItems(lines: ItineraryLine[]): Prisma.BookingItemCreateWithoutBookingInput[] {
    return lines.map((l) => ({
      type: ITEM_TYPE[l.kind ?? "OTHER"],
      description: l.description,
      quantity: l.quantity,
      sellPrice: Math.round(lineTotal(l) / Math.max(1, l.quantity)),
      costPrice: 0,
      held: false,
    }));
  }

  /** Cancels an invoice that has no money against it, so a corrected one can be raised. */
  async cancel(actor: RequestUser, id: string): Promise<InvoiceDetail> {
    const invoice = await this.findAccessible(actor, id, "update");
    if (invoice.status === "CANCELLED") return this.detail(id);
    const verified = await this.prisma.payment.count({ where: { invoiceId: id, status: "VERIFIED" } });
    if (verified > 0) throw AppError.conflict("Payments have been recorded against this invoice, so it can't be cancelled");
    await this.prisma.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "invoice.cancelled", entityType: "Invoice", entityId: id });
    return this.detail(id);
  }

  /** Emails the customer the invoice summary. The PDF can be downloaded from the dashboard and shared as well. */
  async send(actor: RequestUser, id: string): Promise<{ sent: boolean; reason?: string }> {
    await this.findAccessible(actor, id, "update");
    const invoice = await this.detail(id);
    if (invoice.state === "CANCELLED") throw AppError.conflict("This invoice has been cancelled");
    if (!invoice.customerEmail) return { sent: false, reason: "This customer has no email address on file" };

    const lines = invoice.lines.map((l) => `• ${l.description} — ${l.quantity} × ${inr(l.unitPrice)}`).join("\n");
    await this.mail.send({
      to: invoice.customerEmail,
      toName: invoice.customer.fullName,
      subject: `Invoice ${invoice.refNo} from Mashkoor — ${inr(invoice.balance)} due`,
      text: [
        `Dear ${invoice.customer.fullName},`,
        `Please find your invoice ${invoice.refNo} for booking ${invoice.booking.refNo}.`,
        lines,
        `Total: ${inr(invoice.total)}\nPaid so far: ${inr(invoice.paid)}\nBalance due: ${inr(invoice.balance)}${invoice.dueDate ? `\nDue by: ${invoice.dueDate}` : ""}`,
        invoice.notes ?? "",
        "Reply to this email or call us if you would like to pay by bank transfer, UPI or card — we will confirm every payment with a receipt.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      entityType: "Invoice",
      entityId: id,
    });
    await this.prisma.invoice.update({ where: { id }, data: { sentAt: new Date() } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "invoice.sent", entityType: "Invoice", entityId: id });
    return { sent: true };
  }

  async findAccessible(actor: RequestUser, id: string, action: "read" | "update") {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw AppError.notFound("Invoice");
    if (!this.abilities.forUser(actor).can(action, subject("Invoice", invoice))) throw AppError.forbidden();
    return invoice;
  }

  async detail(id: string): Promise<InvoiceDetail> {
    return toDetail(await this.prisma.invoice.findUniqueOrThrow({ where: { id }, include }));
  }
}
