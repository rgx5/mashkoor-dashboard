import { Body, Get, Post, Query } from "@nestjs/common";
import { activityInputSchema, activityListQuerySchema, type ActivityInput } from "@mashkoor/shared";
import type { z } from "zod";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { ActivitiesService } from "../domain/activities.service";

/** `/api/v1/admin/activities` — timeline entries for leads and customers. */
@PortalController("admin", "activities")
export class AdminActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @CheckAbility("read", "Activity")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(activityListQuerySchema)) query: z.output<typeof activityListQuerySchema>) {
    return this.activities.listForEntity(actor, query.entityType, query.entityId, query.limit);
  }

  @Post()
  @CheckAbility("create", "Activity")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(activityInputSchema)) body: ActivityInput) {
    return this.activities.logManual(actor, body);
  }
}
