import { Body, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  transportListQuerySchema,
  transportOptionInputSchema,
  transportOptionUpdateSchema,
  type TransportListQuery,
  type TransportOptionData,
  type TransportOptionUpdateData,
} from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { RequireFeatures } from "../../../core/features/require-features";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { TransportService } from "../domain/transport.service";

/** `/api/v1/admin/transport-inventory` — vehicles and routes with a price per vehicle. */
@PortalController("admin", "transport-inventory")
@RequireFeatures("bookings")
export class AdminTransportController {
  constructor(private readonly transport: TransportService) {}

  @Get()
  @CheckAbility("read", "TransportOption")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(transportListQuerySchema)) query: TransportListQuery) {
    return this.transport.list(actor, query);
  }

  @Post()
  @CheckAbility("create", "TransportOption")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(transportOptionInputSchema)) body: TransportOptionData) {
    return this.transport.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "TransportOption")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(transportOptionUpdateSchema)) body: TransportOptionUpdateData) {
    return this.transport.update(actor, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @CheckAbility("delete", "TransportOption")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.transport.remove(actor, id);
  }
}
