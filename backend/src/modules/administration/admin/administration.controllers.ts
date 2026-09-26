import { Body, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  auditListQuerySchema,
  importRequestSchema,
  notificationListQuerySchema,
  testEmailSchema,
  type AuditListQuery,
  type ImportRequest,
  type NotificationListQuery,
} from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { AdminToolsService } from "../domain/admin-tools.service";
import { ImportService } from "../domain/import.service";

/** `/api/v1/admin/notifications` — the email log, retries and a test send. */
@PortalController("admin", "notifications")
export class AdminNotificationsController {
  constructor(private readonly tools: AdminToolsService) {}

  @Get()
  @CheckAbility("read", "NotificationLog")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(notificationListQuerySchema)) query: NotificationListQuery) {
    return this.tools.listNotifications(actor, query);
  }

  @Post("test")
  @HttpCode(200)
  @CheckAbility("update", "NotificationLog")
  test(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(testEmailSchema)) body: { to: string }) {
    return this.tools.sendTest(actor, body.to);
  }

  @Post(":id/resend")
  @HttpCode(200)
  @CheckAbility("update", "NotificationLog")
  resend(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.tools.resend(actor, id);
  }
}

/** `/api/v1/admin/integrations` — what is connected (mail provider, payment gateway, WhatsApp). */
@PortalController("admin", "integrations")
export class AdminIntegrationsController {
  constructor(private readonly tools: AdminToolsService) {}

  @Get()
  @CheckAbility("read", "NotificationLog")
  status(@CurrentUser() actor: RequestUser) {
    return this.tools.integrations(actor);
  }
}

/** `/api/v1/admin/audit-logs` — who did what, and when. */
@PortalController("admin", "audit-logs")
export class AdminAuditController {
  constructor(private readonly tools: AdminToolsService) {}

  @Get()
  @CheckAbility("read", "AuditLog")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(auditListQuerySchema)) query: AuditListQuery) {
    return this.tools.listAudit(actor, query);
  }

  @Get("entity-types")
  @CheckAbility("read", "AuditLog")
  entityTypes(@CurrentUser() actor: RequestUser) {
    return this.tools.auditEntityTypes(actor);
  }
}

/** `/api/v1/admin/import` — CSV import. Send `commit: false` to preview, `true` to create the valid rows. */
@PortalController("admin", "import")
export class AdminImportController {
  constructor(private readonly importer: ImportService) {}

  @Post()
  @HttpCode(200)
  run(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(importRequestSchema)) body: ImportRequest) {
    return this.importer.run(actor, body);
  }
}
