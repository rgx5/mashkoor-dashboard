import { HttpStatus, Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import type { CheckoutOrder, MockCheckoutInput, PaymentLinkData, PaymentLinkRow, PublicPaymentLink } from "@mashkoor/shared";
import { Prisma, type PaymentLink } from "@prisma/client";
import { toIso } from "../../../common/serialize";
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
import { MockPaymentGateway, type GatewayEvent } from "../gateway/mock-gateway";
import { PaymentsService } from "./payments.service";

const HOUR = 3600_000;

/**
 * M11 · Payment links and the gateway flow.
 *
 * A link is a secret URL for an amount against a booking. The customer pays on the gateway; the gateway then calls
 * our webhook with a *signed* event, and only that webhook records the payment. Repeated deliveries of the same
 * event are ignored, so a retrying gateway can never credit a booking twice.
 */
@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly payments: PaymentsService,
    private readonly gateway: MockPaymentGateway,
  ) {}

  private url(token: string) {
    return `${this.config.get("APP_URL")}/pay/${token}`;
  }

  private toRow(l: PaymentLink): PaymentLinkRow {
    return { id: l.id, bookingId: l.bookingId, amount: l.amount, status: l.status, url: this.url(l.token), note: l.note, expiresAt: toIso(l.expiresAt)!, paidAt: toIso(l.paidAt), createdAt: toIso(l.createdAt)! };
  }

  // ─── Staff / customer-portal side ─────────────────────────────────────────

  async listForBooking(actor: RequestUser, bookingId: string): Promise<PaymentLinkRow[]> {
    await this.assertBookingAccess(actor, bookingId, "read");
    await this.expireStale();
    const links = await this.prisma.paymentLink.findMany({ where: { bookingId }, orderBy: { createdAt: "desc" }, take: 20 });
    return links.map((l) => this.toRow(l));
  }

  /** Staff create a link for (part of) a booking's balance. */
  async create(actor: RequestUser, input: PaymentLinkData): Promise<PaymentLinkRow> {
    await this.assertBookingAccess(actor, input.bookingId, "update");
    return this.toRow(await this.createLink(input.bookingId, input.amount, input.expiresInHours, input.note, actor.id, actor));
  }

  /** A customer paying their own booking's balance from the portal. Reuses an unexpired link for the same amount. */
  async createForCustomer(actor: RequestUser, bookingId: string): Promise<PaymentLinkRow> {
    await this.assertBookingAccess(actor, bookingId, "read");
    const balance = await this.payments.computeBalance(bookingId);
    if (balance <= 0) throw AppError.conflict("Nothing is due on this booking");
    await this.expireStale();
    const existing = await this.prisma.paymentLink.findFirst({ where: { bookingId, status: "ACTIVE", amount: balance, expiresAt: { gt: new Date(Date.now() + HOUR) } } });
    return this.toRow(existing ?? (await this.createLink(bookingId, balance, 72, null, actor.id, actor)));
  }

  /** A hold link for a booking a visitor just created directly on the website — no staff actor, a short fixed expiry. */
  async createForWebsiteBooking(bookingId: string, amount: number, expiresInHours: number, note: string): Promise<PaymentLinkRow> {
    const link = await this.prisma.paymentLink.create({ data: { token: randomToken(24), bookingId, amount, expiresAt: new Date(Date.now() + expiresInHours * HOUR), note } });
    await this.audit.record({ action: "paymentLink.created", entityType: "PaymentLink", entityId: link.id, after: { bookingId, amount, by: "website" } });
    return this.toRow(link);
  }

  /** A link made by a scheduled job (balance reminders). Reuses an unexpired one for the same amount; null if nothing is due. */
  async createSystemLink(bookingId: string): Promise<PaymentLinkRow | null> {
    const balance = await this.payments.computeBalance(bookingId);
    if (balance <= 0) return null;
    const existing = await this.prisma.paymentLink.findFirst({ where: { bookingId, status: "ACTIVE", amount: balance, expiresAt: { gt: new Date(Date.now() + 24 * HOUR) } } });
    if (existing) return this.toRow(existing);
    const link = await this.prisma.paymentLink.create({ data: { token: randomToken(24), bookingId, amount: balance, expiresAt: new Date(Date.now() + 7 * 24 * HOUR), note: "Balance reminder" } });
    await this.audit.record({ action: "paymentLink.created", entityType: "PaymentLink", entityId: link.id, after: { bookingId, amount: balance, by: "system" } });
    return this.toRow(link);
  }

  async cancel(actor: RequestUser, id: string): Promise<PaymentLinkRow> {
    const link = await this.prisma.paymentLink.findUnique({ where: { id } });
    if (!link) throw AppError.notFound("Payment link");
    await this.assertBookingAccess(actor, link.bookingId, "update");
    if (link.status !== "ACTIVE") throw AppError.conflict("Only an active link can be cancelled");
    const updated = await this.prisma.paymentLink.update({ where: { id }, data: { status: "CANCELLED" } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "paymentLink.cancelled", entityType: "PaymentLink", entityId: id });
    return this.toRow(updated);
  }

  /** Emails the link to the customer. Returns whether an email could be sent (a customer may have none on file). */
  async sendToCustomer(actor: RequestUser, id: string): Promise<{ sent: boolean; reason?: string }> {
    const link = await this.prisma.paymentLink.findUnique({ where: { id }, include: { booking: { include: { customer: true } } } });
    if (!link) throw AppError.notFound("Payment link");
    await this.assertBookingAccess(actor, link.bookingId, "update");
    if (link.status !== "ACTIVE") throw AppError.conflict("This link is no longer active");
    const customer = link.booking.customer;
    if (!customer.email) return { sent: false, reason: "This customer has no email address on file" };
    await this.mail.send({
      ...emails.paymentLink({ customerName: customer.fullName, amount: link.amount, bookingRef: link.booking.refNo, url: this.url(link.token), expiresAt: link.expiresAt }),
      to: customer.email,
      toName: customer.fullName,
      entityType: "PaymentLink",
      entityId: link.id,
    });
    return { sent: true };
  }

  /** Marks links past their expiry. Called on reads and by the hourly job. */
  async expireStale() {
    await this.prisma.paymentLink.updateMany({ where: { status: "ACTIVE", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
  }

  private async createLink(bookingId: string, amount: number | undefined, expiresInHours: number, note: string | null | undefined, createdById: string, actor: RequestUser) {
    const balance = await this.payments.computeBalance(bookingId);
    if (balance <= 0) throw AppError.conflict("Nothing is due on this booking");
    const toCollect = amount ?? balance;
    if (toCollect > balance) throw AppError.conflict(`The amount can't exceed the balance due (₹${balance.toLocaleString("en-IN")})`);

    const link = await this.prisma.paymentLink.create({
      data: { token: randomToken(24), bookingId, amount: toCollect, expiresAt: new Date(Date.now() + expiresInHours * HOUR), note: note ?? null, createdById },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "paymentLink.created", entityType: "PaymentLink", entityId: link.id, after: { bookingId, amount: toCollect } });
    return link;
  }

  private async assertBookingAccess(actor: RequestUser, bookingId: string, action: "read" | "update") {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw AppError.notFound("Booking");
    if (!this.abilities.forUser(actor).can(action, subject("Booking", booking))) throw AppError.forbidden();
    return booking;
  }

  // ─── Public side (the customer's browser) ─────────────────────────────────

  async view(token: string): Promise<PublicPaymentLink> {
    const link = await this.findByToken(token);
    const paid = link.status === "PAID" ? await this.prisma.payment.findFirst({ where: { paymentLinkId: link.id }, orderBy: { createdAt: "desc" } }) : null;
    const company = ((await this.prisma.setting.findUnique({ where: { key: "company.profile" } }))?.value ?? {}) as { name?: string; phones?: string[] };
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id: link.bookingId }, include: { customer: { select: { fullName: true } } } });
    return {
      status: link.status,
      amount: link.amount,
      currency: booking.currency,
      bookingRef: booking.refNo,
      customerName: booking.customer.fullName,
      description: [booking.productType.charAt(0) + booking.productType.slice(1).toLowerCase(), booking.destination].filter(Boolean).join(" · "),
      expiresAt: toIso(link.expiresAt)!,
      receiptNo: paid?.receiptNo ?? null,
      gateway: this.gateway.name,
      company: { name: company.name ?? "Mashkoor International Tourism", phone: company.phones?.[0] ?? null },
    };
  }

  /** Step 1 of paying: create the gateway order for this link. */
  async startCheckout(token: string): Promise<CheckoutOrder> {
    const link = await this.findByToken(token);
    if (link.status !== "ACTIVE") throw AppError.conflict("This payment link can no longer be used");
    if (!this.gateway.enabled) throw AppError.conflict("Online payments aren't available yet — please contact us to pay");
    const { orderId } = await this.gateway.createOrder({ amount: link.amount, reference: link.id });
    await this.prisma.paymentLink.update({ where: { id: link.id }, data: { gatewayOrderId: orderId } });
    return { orderId, amount: link.amount, gateway: this.gateway.name };
  }

  /**
   * Test-mode only: plays the part of the gateway by delivering a signed event to our own webhook handler —
   * the same code path a real gateway's webhook would take. The browser never marks anything paid itself.
   */
  async mockComplete(token: string, input: MockCheckoutInput): Promise<PublicPaymentLink> {
    if (!this.gateway.enabled) throw AppError.forbidden("Test payments are switched off on this server");
    const link = await this.findByToken(token);
    if (link.gatewayOrderId !== input.orderId) throw AppError.conflict("Start the payment again");
    if (link.status !== "ACTIVE") throw AppError.conflict("This payment link can no longer be used");
    const event = this.gateway.newEvent(input.outcome === "SUCCESS" ? "payment.captured" : "payment.failed", input.orderId, link.amount, input.method);
    await this.handleGatewayEvent(event, this.gateway.sign(event));
    return this.view(token);
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  /** Entry point for gateway events. Verifies the signature, ignores repeats, then credits the booking. */
  async handleGatewayEvent(event: GatewayEvent, signature: string): Promise<{ status: "processed" | "duplicate" | "ignored" }> {
    if (!this.gateway.verify(event, signature)) throw new AppError(HttpStatus.UNAUTHORIZED, "INVALID_SIGNATURE", "Signature check failed");

    // The unique (channel, externalId) row is the idempotency guard: a second delivery of this event stops here.
    let inboundId: string;
    try {
      inboundId = (await this.prisma.inboundEvent.create({ data: { channel: "PAYMENT_GATEWAY", externalId: event.eventId, payload: event as unknown as Prisma.InputJsonValue } })).id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { status: "duplicate" };
      throw error;
    }
    const finish = (status: "PROCESSED" | "IGNORED" | "FAILED", error?: string) =>
      this.prisma.inboundEvent.update({ where: { id: inboundId }, data: { status, error: error ?? null, processedAt: new Date() } });

    const link = await this.prisma.paymentLink.findUnique({ where: { gatewayOrderId: event.orderId }, include: { booking: { include: { customer: true } } } });
    if (!link) {
      await finish("IGNORED", "Unknown order");
      return { status: "ignored" };
    }
    if (event.type === "payment.failed") {
      await finish("PROCESSED");
      return { status: "processed" }; // the link stays active so the customer can try again
    }
    if (event.amount !== link.amount) {
      await finish("FAILED", `Amount mismatch: gateway ${event.amount}, link ${link.amount}`);
      return { status: "ignored" };
    }
    if (link.status === "PAID") {
      await finish("IGNORED", "Link already paid");
      return { status: "ignored" };
    }

    // Money has arrived, so it is recorded even if the link had expired while the customer was paying.
    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          receiptNo: await this.sequences.next("receipt", tx),
          bookingId: link.bookingId,
          direction: "COLLECTION",
          method: "GATEWAY",
          amount: link.amount,
          status: "VERIFIED",
          verifiedAt: new Date(),
          gatewayRef: event.paymentId,
          reference: `${event.method} · ${event.paymentId}`,
          paymentLinkId: link.id,
          notes: "Paid online through a payment link",
        },
      });
      await tx.paymentLink.update({ where: { id: link.id }, data: { status: "PAID", paidAt: new Date() } });
      await tx.activity.create({
        data: { entityType: "CUSTOMER", entityId: link.booking.customerId, customerId: link.booking.customerId, type: "SYSTEM", body: `Online payment of ₹${link.amount.toLocaleString("en-IN")} received for ${link.booking.refNo} (${created.receiptNo})` },
      });
      await this.audit.record({ action: "payment.gateway_captured", entityType: "Payment", entityId: created.id, after: { amount: link.amount, gatewayRef: event.paymentId } }, tx);
      return created;
    });
    await finish("PROCESSED");

    await this.payments.sendReceipt(payment.id);
    await this.mail.sendToStaff(["OPS_MANAGER", "SUPER_ADMIN"], () =>
      emails.onlinePaymentToStaff({ customerName: link.booking.customer.fullName, bookingRef: link.booking.refNo, amount: link.amount, receiptNo: payment.receiptNo, url: `${this.config.get("APP_URL")}/admin/bookings/${link.bookingId}` }),
    );
    return { status: "processed" };
  }

  private async findByToken(token: string): Promise<PaymentLink> {
    const link = await this.prisma.paymentLink.findUnique({ where: { token } });
    if (!link) throw AppError.notFound("Payment link");
    if (link.status === "ACTIVE" && link.expiresAt < new Date()) return this.prisma.paymentLink.update({ where: { id: link.id }, data: { status: "EXPIRED" } });
    return link;
  }
}
