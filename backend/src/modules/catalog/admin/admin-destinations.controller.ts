import { RequireFeatures } from "../../../core/features/require-features";
import { Body, Get, Param, ParseUUIDPipe, Patch, Post, Query, Delete } from "@nestjs/common";
import { destinationInputSchema, destinationListQuerySchema, destinationUpdateSchema, type DestinationData, type DestinationListQuery, type DestinationUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { DestinationsService } from "../domain/destinations.service";
import { RevalidatesSite } from "../../../core/site/revalidate.interceptor";

/** `/api/v1/admin/destinations` */
@RevalidatesSite("destinations")
@PortalController("admin", "destinations")
@RequireFeatures("website")
export class AdminDestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Get()
  @CheckAbility("read", "Destination")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(destinationListQuerySchema)) query: DestinationListQuery) {
    return this.destinations.list(actor, query);
  }

  @Get(":id")
  @CheckAbility("read", "Destination")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.destinations.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Destination")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(destinationInputSchema)) body: DestinationData) {
    return this.destinations.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Destination")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(destinationUpdateSchema)) body: DestinationUpdateData) {
    return this.destinations.update(actor, id, body);
  }

  @Delete(":id")
  @CheckAbility("delete", "Destination")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.destinations.remove(actor, id);
  }
}
