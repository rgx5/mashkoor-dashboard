import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import type { AuditListQuery, AuditLogRow, IntegrationStatus, NotificationListQuery, NotificationRow, Paginated } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { paginate, toIso } from "../../../common/serialize";
import { loadUserRefs } from "../../../common/user-refs";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

/** M12 + M15 · The email log, integration status and the audit trail viewer. */
@Injectable()
export class AdminToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  // ─── Notification log ─────────────────────────────────────────────────────

  async listNotifications(actor: RequestUser, query: NotificationListQuery): Promise<Paginated<NotificationRow>> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", "NotificationLog")) throw AppError.forbidden();
    const where: Prisma.NotificationLogWhereInput = {
      AND: [
        accessibleBy(ability).NotificationLog,
        query.status ? { status: query.status } : {},
        query.q ? { OR: [{ toEmail: { contains: query.q, mode: "insensitive" } }, { subject: { contains: query.q, mode: "insensitive" } }, { event: { contains: query.q, mode: "insensitive" } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notificationLog.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(query.page, query.pageSize) }),
      this.prisma.notificationLog.count({ where }),
    ]);
    return {
      data: rows.map((n) => ({ id: n.id, event: n.event, toEmail: n.toEmail, toName: n.toName, subject: n.subject, status: n.status, provider: n.provider, error: n.error, attempts: n.attempts, createdAt: toIso(n.createdAt)!, sentAt: toIso(n.sentAt) })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async resend(actor: RequestUser, id: string) {
    if (!this.abilities.forUser(actor).can("update", "NotificationLog")) throw AppError.forbidden();
    if (!(await this.prisma.notificationLog.findUnique({ where: { id } }))) throw AppError.notFound("Notification");
    await this.mail.resend(id);
    const after = await this.prisma.notificationLog.findUniqueOrThrow({ where: { id } });
    return { status: after.status, error: after.error };
  }

  /** Sends a real test message through the configured provider and reports what happened. */
  async sendTest(actor: RequestUser, to: string) {
    if (!this.abilities.forUser(actor).can("update", "NotificationLog")) throw AppError.forbidden();
    await this.mail.send({ ...emails.test(), to, toName: null });
    const log = await this.prisma.notificationLog.findFirst({ where: { toEmail: to.toLowerCase(), event: "test" }, orderBy: { createdAt: "desc" } });
    return { status: log?.status ?? "FAILED", error: log?.error ?? null, provider: log?.provider ?? this.mail.status().provider };
  }

  integrations(actor: RequestUser): IntegrationStatus {
    if (!this.abilities.forUser(actor).can("read", "NotificationLog")) throw AppError.forbidden();
    return {
      mail: this.mail.status(),
      payments: { gateway: this.config.get("PAYMENT_GATEWAY"), note: this.config.isProduction ? "Test payments are switched off in production. Connect a real gateway to accept online payments." : "Test gateway: no real money moves. Payments are recorded only from the signed webhook." },
      whatsapp: { mode: "click-to-chat" },
    };
  }

  // ─── Audit log ────────────────────────────────────────────────────────────

  async listAudit(actor: RequestUser, query: AuditListQuery): Promise<Paginated<AuditLogRow>> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", "AuditLog")) throw AppError.forbidden();
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        accessibleBy(ability).AuditLog,
        query.entityType ? { entityType: query.entityType } : {},
        query.actorId ? { actorId: query.actorId } : {},
        query.from ? { createdAt: { gte: new Date(`${query.from}T00:00:00.000+05:30`) } } : {},
        query.to ? { createdAt: { lte: new Date(`${query.to}T23:59:59.999+05:30`) } } : {},
        query.q ? { OR: [{ action: { contains: query.q, mode: "insensitive" } }, { entityId: { contains: query.q } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(query.page, query.pageSize) }),
      this.prisma.auditLog.count({ where }),
    ]);
    const users = await loadUserRefs(this.prisma, rows.map((r) => r.actorId));
    return {
      data: rows.map((r) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, actor: (r.actorId && users.get(r.actorId)) || null, portal: r.portal, before: r.before, after: r.after, createdAt: toIso(r.createdAt)! })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** Entity types present in the audit log, for the filter dropdown. */
  async auditEntityTypes(actor: RequestUser): Promise<string[]> {
    if (!this.abilities.forUser(actor).can("read", "AuditLog")) throw AppError.forbidden();
    const rows = await this.prisma.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } });
    return rows.map((r) => r.entityType);
  }
}
