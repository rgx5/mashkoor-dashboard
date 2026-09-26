import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { IntegrationStatus } from "@mashkoor/shared";
import { Prisma, type Role } from "@prisma/client";
import { AppConfig } from "../config/app-config.service";
import { PrismaService } from "../prisma/prisma.service";
import { emailLayout } from "./templates";
import type { MailMessage, MailProvider } from "./mail.types";
import { ConsoleMailProvider, Msg91MailProvider } from "./providers";

const MAX_ATTEMPTS = 5;
const RETRY_EVERY_MS = 60_000;

/**
 * M12 · Email. Every message is written to the notification log first, then delivered, so a provider outage
 * never loses an email — failures are retried automatically and can be re-sent from the Admin. Sending never
 * throws: a broken mail provider must not break a booking, a payment or a login.
 */
@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Mail");
  private readonly provider: MailProvider;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    this.provider = config.get("MAIL_PROVIDER") === "msg91" ? new Msg91MailProvider(config) : new ConsoleMailProvider();
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.retryFailed(), RETRY_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  status(): IntegrationStatus["mail"] {
    const missing = this.provider.name === "msg91" ? Msg91MailProvider.missing(this.config) : [];
    return { provider: this.provider.name, configured: missing.length === 0, from: this.provider.name === "msg91" ? (this.config.get("MSG91_EMAIL_FROM") ?? null) : null, missing };
  }

  /** Queues and delivers one email. Returns quietly if `dedupeKey` was already used. */
  async send(message: MailMessage): Promise<void> {
    try {
      const log = await this.prisma.notificationLog.create({
        data: {
          event: message.event ?? "email",
          toEmail: message.to.trim().toLowerCase(),
          toName: message.toName ?? null,
          subject: message.subject,
          bodyText: message.text,
          bodyHtml: message.html ?? emailLayout({ heading: message.subject, paragraphs: message.text.split(/\n{2,}/) }).html,
          provider: this.provider.name,
          dedupeKey: message.dedupeKey ?? null,
          entityType: message.entityType ?? null,
          entityId: message.entityId ?? null,
        },
      });
      await this.deliver(log.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return; // already sent (dedupe)
      this.logger.error(`Could not queue "${message.subject}" for ${message.to}`, error instanceof Error ? error.stack : undefined);
    }
  }

  /** Emails every active staff member holding one of `roles` (e.g. the managers, when a partner submits a booking). */
  async sendToStaff(roles: Role[], build: (user: { id: string; name: string }) => Omit<MailMessage, "to" | "toName">) {
    const staff = await this.prisma.user.findMany({ where: { type: "STAFF", status: "ACTIVE", role: { in: roles } }, select: { id: true, name: true, email: true } });
    await Promise.all(staff.map((u) => this.send({ ...build(u), to: u.email, toName: u.name })));
  }

  /** Attempts delivery of a logged message. Safe to call repeatedly. */
  async deliver(id: string): Promise<void> {
    const log = await this.prisma.notificationLog.findUnique({ where: { id } });
    if (!log || log.status === "SENT") return;
    try {
      const result = await this.provider.send({ to: log.toEmail, toName: log.toName, subject: log.subject, text: log.bodyText, html: log.bodyHtml ?? log.bodyText });
      await this.prisma.notificationLog.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, providerRef: result.ref ?? null, error: null, provider: this.provider.name } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Email to ${log.toEmail} failed (attempt ${log.attempts + 1}): ${message}`);
      await this.prisma.notificationLog.update({ where: { id }, data: { status: "FAILED", attempts: { increment: 1 }, error: message.slice(0, 500) } });
    }
  }

  /** Re-sends a failed email on request (also used by the automatic retry sweep). */
  async resend(id: string) {
    await this.prisma.notificationLog.update({ where: { id }, data: { status: "QUEUED", error: null } });
    await this.deliver(id);
  }

  /** Retries emails that failed or got stuck, up to MAX_ATTEMPTS, for a day after they were created. */
  async retryFailed() {
    try {
      const due = await this.prisma.notificationLog.findMany({
        where: { status: { in: ["FAILED", "QUEUED"] }, attempts: { lt: MAX_ATTEMPTS }, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
        orderBy: { createdAt: "asc" },
        take: 20,
      });
      for (const log of due) await this.deliver(log.id);
    } catch (error) {
      this.logger.error("Retry sweep failed", error instanceof Error ? error.stack : undefined);
    }
  }
}
