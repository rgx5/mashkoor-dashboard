import { Get, Query } from "@nestjs/common";
import { inventorySearchQuerySchema, quoteInventorySearchQuerySchema, type InventorySearchQuery, type QuoteInventorySearchQuery } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { RequireFeatures } from "../../../core/features/require-features";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { AppError } from "../../../core/http/app-error";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { PricingService } from "../../pricing/domain/pricing.service";
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
    private readonly pricing: PricingService,
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

  /**
   * Hotels and flights from our own inventory, priced for the customer — for adding to a quotation. Whoever is quoting sees
   * the price the pricing rules give, never the supplier cost, so a sales agent can use it without seeing margins.
   */
  @Get("quote-search")
  @CheckAbility("read", "RatePeriod")
  async quoteSearch(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(quoteInventorySearchQuerySchema)) query: QuoteInventorySearchQuery & { productType: NonNullable<QuoteInventorySearchQuery["productType"]> }) {
    const ability = this.abilities.forUser(actor);
    if (query.kind === "FLIGHT") {
      if (!ability.can("read", "FlightSeatBlock")) throw AppError.forbidden();
      const flights = await this.availability.searchFlights(query);
      return Promise.all(flights.map(async ({ costPrice, notes: _notes, totalSeats: _total, bookedSeats: _booked, ...flight }) => ({ ...flight, price: await this.pricing.suggestSellPrice("B2C", query.productType, costPrice ?? 0) })));
    }
    const rooms = await this.availability.searchRooms(query);
    return Promise.all(
      rooms.map(async (room) => ({
        hotel: room.hotel,
        roomType: room.roomType,
        stay: { id: room.ratePeriod.id, startDate: room.ratePeriod.startDate, endDate: room.ratePeriod.endDate, available: room.ratePeriod.available },
        price: await this.pricing.suggestSellPrice("B2C", query.productType, room.ratePeriod.costPrice ?? 0),
      })),
    );
  }
}
