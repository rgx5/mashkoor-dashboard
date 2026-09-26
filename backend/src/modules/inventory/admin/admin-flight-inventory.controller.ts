import { Body, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  flightSeatBlockInputSchema,
  flightSeatBlockListQuerySchema,
  flightSeatBlockUpdateSchema,
  type FlightSeatBlockData,
  type FlightSeatBlockListQuery,
  type FlightSeatBlockUpdateData,
} from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { FlightInventoryService } from "../domain/flight-inventory.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `/api/v1/admin/flight-inventory` */
@PortalController("admin", "flight-inventory")
@RequireFeatures("bookings")
export class AdminFlightInventoryController {
  constructor(private readonly flights: FlightInventoryService) {}

  @Get()
  @CheckAbility("read", "FlightSeatBlock")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(flightSeatBlockListQuerySchema)) query: FlightSeatBlockListQuery) {
    return this.flights.list(actor, query);
  }

  @Post()
  @CheckAbility("create", "FlightSeatBlock")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(flightSeatBlockInputSchema)) body: FlightSeatBlockData) {
    return this.flights.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "FlightSeatBlock")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(flightSeatBlockUpdateSchema)) body: FlightSeatBlockUpdateData) {
    return this.flights.update(actor, id, body);
  }

  @Delete(":id")
  @CheckAbility("delete", "FlightSeatBlock")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.flights.remove(actor, id);
  }
}
