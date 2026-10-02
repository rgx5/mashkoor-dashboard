import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import {
  type InvoiceData,
  type InvoiceDetail,
  type InvoiceLine,
  type InvoiceListQuery,
  type InvoicePaymentState,
  type InvoiceRow,
  type Paginated,
} from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
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
  booking: { select: { id: true, refNo: true } },
  customer: { select: { id: true, refNo: true, fullName: true, email: true } },
  lead: { select: { id: true, refNo: true } },
  payments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.InvoiceInclude;
type InvoiceWithRefs = Prisma.InvoiceGetPayload<{ include: typeof include }>;

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
  lines: i.lines as unknown as InvoiceLine[],
  adjustment: i.adjustment,
  notes: i.notes,
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

  async create(actor: RequestUser, input: InvoiceData): Promise<InvoiceDetail> {
    const booking = await this.prisma.booking.findUnique({ where: { id: input.bookingId }, include: { items: true } });
    if (!booking) throw AppError.notFound("Booking");
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", subject("Booking", booking))) throw AppError.forbidden();
    if (booking.status === "CANCELLED" || booking.status === "FAILED") throw AppError.conflict("This booking is cancelled, so it can't be invoiced");
    if (booking.items.length === 0) throw AppError.conflict("This booking has no priced items to invoice");

    const existing = await this.prisma.invoice.findFirst({ where: { bookingId: booking.id, status: "ISSUED" }, select: { refNo: true } });
    if (existing) throw AppError.conflict(`This booking already has invoice ${existing.refNo}. Cancel it first to raise a new one.`);

    const lines: InvoiceLine[] = booking.items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.sellPrice }));
    const adjustment = -booking.discount;
    const total = Math.max(0, lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) + adjustment);
    const itinerary = await this.prisma.itinerary.findFirst({ where: { convertedBookingId: booking.id }, select: { id: true } });

    const created = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          refNo: await this.sequences.next("invoice", tx),
          bookingId: booking.id,
          customerId: booking.customerId,
          leadId: booking.leadId,
          itineraryId: itinerary?.id ?? null,
          dueDate: fromDateOnly(input.dueDate) ?? null,
          lines: lines as unknown as Prisma.InputJsonValue,
          adjustment,
          total,
          notes: input.notes,
          createdById: actor.id,
        },
      });
      if (booking.leadId) {
        await this.activities.record({ entityType: "LEAD", entityId: booking.leadId, customerId: booking.customerId, type: "SYSTEM", body: `Invoice ${invoice.refNo} raised for ${inr(total)}`, actorId: actor.id }, tx);
      }
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "invoice.created", entityType: "Invoice", entityId: invoice.id, after: { refNo: invoice.refNo, total, bookingId: booking.id } }, tx);
      return invoice;
    });
    return this.detail(created.id);
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
