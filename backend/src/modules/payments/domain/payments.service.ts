import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import { PAYMENT_METHOD_LABELS, type BookingPaymentSummary, type Paginated, type PaymentData, type PaymentListQuery, type PaymentRow, type UserRef } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { paginate, toIso } from "../../../common/serialize";
import { loadUserRefs } from "../../../common/user-refs";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { emails } from "../../../core/mail/templates";
import { MailService } from "../../../core/mail/mail.service";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const include = {
  booking: { select: { id: true, refNo: true, customer: { select: { id: true, fullName: true } } } },
} satisfies Prisma.PaymentInclude;
type PaymentWithRefs = Prisma.PaymentGetPayload<{ include: typeof include }>;

const toRow = (p: PaymentWithRefs, users: Map<string, UserRef>): PaymentRow => ({
  id: p.id,
  receiptNo: p.receiptNo,
  bookingId: p.bookingId,
  booking: p.booking,
  direction: p.direction,
  method: p.method,
  amount: p.amount,
  reference: p.reference,
  gatewayRef: p.gatewayRef,
  status: p.status,
  notes: p.notes,
  recordedBy: (p.recordedById && users.get(p.recordedById)) || null,
  verifiedBy: (p.verifiedById && users.get(p.verifiedById)) || null,
  verifiedAt: toIso(p.verifiedAt),
  createdAt: toIso(p.createdAt)!,
});

/**
 * M11 · Payments — offline collections only (cash / bank transfer / UPI / card recorded by staff).
 * No gateway is wired up, so nothing here charges a card; it's a ledger of money staff have received.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async list(actor: RequestUser, query: PaymentListQuery): Promise<Paginated<PaymentRow>> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("collect", "Booking")) throw AppError.forbidden();
    // Scoped by whatever bookings this actor can see (mirrors BookingsService's own scoping).
    const where: Prisma.PaymentWhereInput = {
      AND: [{ booking: accessibleBy(ability).Booking }, query.bookingId ? { bookingId: query.bookingId } : {}, query.customerId ? { booking: { customerId: query.customerId } } : {}, query.status ? { status: query.status } : {}],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({ where, include, orderBy: { createdAt: "desc" }, ...paginate(query.page, query.pageSize) }),
      this.prisma.payment.count({ where }),
    ]);
    const users = await this.users(rows);
    return { data: rows.map((r) => toRow(r, users)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Balance due on one booking: sell price minus verified collections, plus verified refunds. */
  async summaryForBooking(actor: RequestUser, bookingId: string): Promise<BookingPaymentSummary> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw AppError.notFound("Booking");
    if (!this.abilities.forUser(actor).can("read", subject("Booking", booking))) throw AppError.forbidden();

    const rows = await this.prisma.payment.findMany({ where: { bookingId }, include, orderBy: { createdAt: "desc" } });
    const users = await this.users(rows);
    const verified = rows.filter((p) => p.status === "VERIFIED");
    const totalCollected = verified.filter((p) => p.direction === "COLLECTION").reduce((s, p) => s + p.amount, 0);
    const totalRefunded = verified.filter((p) => p.direction === "REFUND").reduce((s, p) => s + p.amount, 0);
    return { totalSell: booking.totalSell, totalCollected, totalRefunded, balanceDue: booking.totalSell - totalCollected + totalRefunded, payments: rows.map((r) => toRow(r, users)) };
  }

  async record(actor: RequestUser, input: PaymentData): Promise<PaymentRow> {
    const booking = await this.prisma.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw AppError.notFound("Booking");
    if (!this.abilities.forUser(actor).can("collect", subject("Booking", booking))) throw AppError.forbidden();

    const created = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { ...input, receiptNo: await this.sequences.next("receipt", tx), recordedById: actor.id },
        include,
      });
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "payment.recorded", entityType: "Payment", entityId: payment.id, after: payment }, tx);
      return payment;
    });
    return toRow(created, await this.users([created]));
  }

  /** Staff confirm the money actually landed (bank statement reconciled, cash counted, etc.). */
  async verify(actor: RequestUser, id: string): Promise<PaymentRow> {
    const payment = await this.findAccessible(actor, id, "collect");
    if (payment.status !== "PENDING") throw AppError.conflict("This payment has already been actioned");
    const updated = await this.prisma.payment.update({ where: { id }, data: { status: "VERIFIED", verifiedById: actor.id, verifiedAt: new Date() }, include });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "payment.verified", entityType: "Payment", entityId: id });
    await this.sendReceipt(id);
    return toRow(updated, await this.users([updated]));
  }

  async reject(actor: RequestUser, id: string, reason: string): Promise<PaymentRow> {
    const payment = await this.findAccessible(actor, id, "collect");
    if (payment.status !== "PENDING") throw AppError.conflict("This payment has already been actioned");
    const updated = await this.prisma.payment.update({ where: { id }, data: { status: "REJECTED", notes: [payment.notes, `Rejected: ${reason}`].filter(Boolean).join("\n"), verifiedById: actor.id, verifiedAt: new Date() }, include });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "payment.rejected", entityType: "Payment", entityId: id, after: { reason } });
    return toRow(updated, await this.users([updated]));
  }

  /** Balance still owed on a booking: sell price minus verified collections, plus verified refunds. No permission check. */
  async computeBalance(bookingId: string): Promise<number> {
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { totalSell: true } });
    const rows = await this.prisma.payment.findMany({ where: { bookingId, status: "VERIFIED" }, select: { amount: true, direction: true } });
    return booking.totalSell - rows.reduce((sum, p) => sum + (p.direction === "COLLECTION" ? p.amount : -p.amount), 0);
  }

  /** Emails the customer a receipt for a verified collection. Quiet when the customer has no email on file. */
  async sendReceipt(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { booking: { include: { customer: true } } } });
    if (!payment || payment.status !== "VERIFIED" || payment.direction !== "COLLECTION" || !payment.booking.customer.email) return;
    const balanceDue = await this.computeBalance(payment.bookingId);
    await this.mail.send({
      ...emails.paymentReceipt({ customerName: payment.booking.customer.fullName, receiptNo: payment.receiptNo, amount: payment.amount, bookingRef: payment.booking.refNo, method: PAYMENT_METHOD_LABELS[payment.method], balanceDue: Math.max(0, balanceDue) }),
      to: payment.booking.customer.email,
      toName: payment.booking.customer.fullName,
      dedupeKey: `receipt:${payment.id}`,
      entityType: "Payment",
      entityId: payment.id,
    });
  }

  private users(rows: { recordedById: string | null; verifiedById: string | null }[]) {
    return loadUserRefs(this.prisma, rows.flatMap((r) => [r.recordedById, r.verifiedById]));
  }

  private async findAccessible(actor: RequestUser, id: string, action: "collect") {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { booking: true } });
    if (!payment) throw AppError.notFound("Payment");
    if (!this.abilities.forUser(actor).can(action, subject("Booking", payment.booking))) throw AppError.forbidden();
    return payment;
  }
}
