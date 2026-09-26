import { Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { inboundEventListQuerySchema, type InboundEventListQuery } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { InboundEventsService } from "../domain/inbound-events.service";

/** `/api/v1/admin/inbound-events` — what arrived from outside, and replay for anything that failed. */
@PortalController("admin", "inbound-events")
export class AdminInboundEventsController {
  constructor(private readonly events: InboundEventsService) {}

  @Get()
  @CheckAbility("read", "InboundEvent")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(inboundEventListQuerySchema)) query: InboundEventListQuery) {
    return this.events.list(actor, query);
  }

  @Post(":id/replay")
  @HttpCode(200)
  @CheckAbility("update", "InboundEvent")
  replay(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.events.replay(actor, id);
  }
}
