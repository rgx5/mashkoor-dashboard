import { Get, Query } from "@nestjs/common";
import { inventorySearchQuerySchema, type InventorySearchQuery } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { RequireFeatures } from "../../../core/features/require-features";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { InventoryAvailabilityService } from "../domain/inventory-availability.service";
import { redactFlightCost } from "../domain/flight-inventory.service";
import { redactRateCost } from "../domain/hotels.service";

/** `/api/v1/admin/inventory/search` — the booking wizard's combined room/flight search step. */
@PortalController("admin", "inventory")
@RequireFeatures("bookings")
export class AdminInventorySearchController {
  constructor(
    private readonly availability: InventoryAvailabilityService,
    private readonly abilities: AbilityFactory,
  ) {}

  @Get("search")
  @CheckAbility("read", "RatePeriod")
  async search(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(inventorySearchQuerySchema)) query: InventorySearchQuery) {
    const ability = this.abilities.forUser(actor);
    if (query.kind === "FLIGHT") {
      const showCost = ability.can("manage", "FlightSeatBlock");
      return (await this.availability.searchFlights(query)).map((f) => redactFlightCost(f, showCost));
    }
    const showCost = ability.can("manage", "RatePeriod");
    return (await this.availability.searchRooms(query)).map((room) => ({ ...room, ratePeriod: redactRateCost(room.ratePeriod, showCost) }));
  }
}
