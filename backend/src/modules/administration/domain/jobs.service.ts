import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AppConfig } from "../../../core/config/app-config.service";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { InventoryAvailabilityService } from "../../inventory/domain/inventory-availability.service";
import { PaymentLinksService } from "../../payments/domain/payment-links.service";
import { PaymentsService } from "../../payments/domain/payments.service";

const TICK_MS = 15 * 60_000;
const FIRST_TICK_MS = 45_000;
const IST_OFFSET = 5.5 * 3600_000;
const DAY_MS = 24 * 3600_000;
/** Below this (balance + credit), a partner is nudged to top up. */
const LOW_WALLET = 20_000;
const REMINDER_DAYS = [7, 2];

/**
 * Scheduled work, run in-process every 15 minutes. Every job is safe to repeat — sends carry a `dedupeKey`, so a
 * reminder or digest goes out once no matter how many ticks see it (and a restart mid-day can't double-send).
 * If the app moves to several instances, this is the one place to swap for a queue with a single scheduler.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Jobs");
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly links: PaymentLinksService,
    private readonly payments: PaymentsService,
    private readonly inventory: InventoryAvailabilityService,
  ) {}

  onModuleInit() {
    if (this.config.get("NODE_ENV") === "test") return;
    const first = setTimeout(() => void this.tick(), FIRST_TICK_MS);
    const every = setInterval(() => void this.tick(), TICK_MS);
    first.unref();
    every.unref();
    this.timers = [first, every];
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  async tick() {
    const ist = new Date(Date.now() + IST_OFFSET);
    const ymd = ist.toISOString().slice(0, 10);
    const morning = ist.getUTCHours() >= 9; // reminders go out from 9 AM IST
    await this.run("expire payment links", () => this.links.expireStale());
    await this.run("release expired website holds", () => this.releaseExpiredWebsiteHolds());
    if (!morning) return;
    await this.run("daily digest", () => this.dailyDigest(ymd));
    await this.run("balance reminders", () => this.balanceReminders(ymd));
    await this.run("low wallet alerts", () => this.lowWalletAlerts(ymd));
  }

  private async run(name: string, job: () => Promise<unknown>) {
    try {
      await job();
    } catch (error) {
      this.logger.error(`Job "${name}" failed`, error instanceof Error ? error.stack : undefined);
    }
  }

  /** One email per staff member each morning listing what needs them — only if there is something. */
  private async dailyDigest(ymd: string) {
    const staff = await this.prisma.user.findMany({ where: { type: "STAFF", status: "ACTIVE" }, select: { id: true, name: true, email: true, role: true } });
    const startOfDay = new Date(`${ymd}T00:00:00.000+05:30`);
    const endOfDay = new Date(`${ymd}T23:59:59.999+05:30`);

    for (const user of staff) {
      const dedupeKey = `digest:${user.id}:${ymd}`;
      if (await this.prisma.notificationLog.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;

      const manager = user.role !== "SALES_AGENT";
      const [tasksOverdue, tasksToday, followUps, unassigned, approvals, payments] = await Promise.all([
        this.prisma.task.count({ where: { assigneeId: user.id, status: "OPEN", dueAt: { lt: startOfDay } } }),
        this.prisma.task.count({ where: { assigneeId: user.id, status: "OPEN", dueAt: { gte: startOfDay, lte: endOfDay } } }),
        this.prisma.lead.count({ where: { ownerId: user.id, nextFollowUpAt: { lt: endOfDay }, stage: { in: ["NEW", "CONTACTED", "QUOTATION", "WAITING_PAYMENT"] } } }),
        manager ? this.prisma.lead.count({ where: { ownerId: null, stage: { in: ["NEW", "CONTACTED", "QUOTATION", "WAITING_PAYMENT"] } } }) : 0,
        manager ? this.prisma.booking.count({ where: { status: "PENDING_APPROVAL" } }) : 0,
        manager ? this.prisma.payment.count({ where: { status: "PENDING" } }) : 0,
      ]);
      const items = [
        { label: "Tasks overdue", count: tasksOverdue },
        { label: "Tasks due today", count: tasksToday },
        { label: "Follow-ups due", count: followUps },
        { label: "Leads with no owner", count: unassigned },
        { label: "Bookings awaiting approval", count: approvals },
        { label: "Payments to verify", count: payments },
      ].filter((i) => i.count > 0);
      if (items.length === 0) continue;

      await this.mail.send({ ...emails.staffDigest({ name: user.name, items, url: `${this.config.get("APP_URL")}/admin` }), to: user.email, toName: user.name, dedupeKey });
    }
  }

  /**
   * A website visitor who booked a departure directly but never finished paying: the seat can't stay held
   * forever, so once every payment link on the booking has expired (and none was paid) the hold is released
   * and the booking cancelled. Runs right after `expireStale()`, which is what actually marks links EXPIRED.
   */
  private async releaseExpiredWebsiteHolds() {
    const stuck = await this.prisma.booking.findMany({
      where: { status: "PENDING_PAYMENT", source: "WEBSITE", items: { some: { packageDepartureId: { not: null } } }, paymentLinks: { none: { status: { in: ["ACTIVE", "PAID"] } } } },
      include: { items: true },
    });
    for (const booking of stuck) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of booking.items) {
          if (item.packageDepartureId) await this.inventory.releaseDeparture(tx, item.packageDepartureId, item.quantity);
        }
        await tx.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Payment not completed in time; the seat hold expired" } });
      });
      this.logger.log(`Released expired website hold: booking ${booking.refNo}`);
    }
  }

  /** Nudges customers with a balance due 7 and 2 days before they travel, with a link to pay it. */
  private async balanceReminders(ymd: string) {
    for (const daysOut of REMINDER_DAYS) {
      const departure = new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + daysOut * DAY_MS);
      const bookings = await this.prisma.booking.findMany({
        where: { travelFrom: departure, status: { in: ["PENDING_PAYMENT", "IN_PROGRESS", "CONFIRMED"] }, partnerId: null },
        include: { customer: { select: { fullName: true, email: true } } },
      });
      for (const booking of bookings) {
        if (!booking.customer.email) continue;
        const dedupeKey = `balance:${booking.id}:${daysOut}`;
        if (await this.prisma.notificationLog.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;
        const balanceDue = await this.payments.computeBalance(booking.id);
        if (balanceDue <= 0) continue;
        const link = await this.links.createSystemLink(booking.id);
        await this.mail.send({
          ...emails.balanceReminder({ customerName: booking.customer.fullName, bookingRef: booking.refNo, travelFrom: ymd, balanceDue, daysToGo: daysOut, payUrl: link?.url ?? null }),
          to: booking.customer.email,
          toName: booking.customer.fullName,
          dedupeKey,
          entityType: "Booking",
          entityId: booking.id,
        });
      }
    }
  }

  /** Once a week, tells an agency whose wallet is nearly empty. */
  private async lowWalletAlerts(ymd: string) {
    const week = `${ymd.slice(0, 4)}-w${Math.floor((new Date(`${ymd}T00:00:00Z`).getTime() / DAY_MS + 4) / 7)}`;
    const wallets = await this.prisma.walletAccount.findMany({ where: { partner: { status: "APPROVED" } }, include: { partner: { select: { id: true, companyName: true, contactName: true, email: true } } } });
    for (const wallet of wallets) {
      const available = wallet.balance + wallet.creditLimit;
      if (available >= LOW_WALLET) continue;
      await this.mail.send({
        ...emails.walletLow({ contactName: wallet.partner.contactName, companyName: wallet.partner.companyName, available }),
        to: wallet.partner.email,
        toName: wallet.partner.contactName,
        dedupeKey: `wallet-low:${wallet.partner.id}:${week}`,
        entityType: "Partner",
        entityId: wallet.partner.id,
      });
    }
  }
}
