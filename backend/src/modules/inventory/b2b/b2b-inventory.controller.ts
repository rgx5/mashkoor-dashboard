import { Get, Query } from "@nestjs/common";
import { z } from "zod";
import { PRODUCT_TYPES } from "@mashkoor/shared";
import { PortalController } from "../../../core/auth/decorators";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { PricingService } from "../../pricing/domain/pricing.service";
import { InventoryAvailabilityService } from "../domain/inventory-availability.service";
import { RequireFeatures } from "../../../core/features/require-features";

const b2bSearchQuery = z.object({
  kind: z.enum(["HOTEL", "FLIGHT"]),
  productType: z.enum(PRODUCT_TYPES),
  city: z.string().max(80).optional(),
  origin: z.string().max(4).optional(),
  destination: z.string().max(4).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

/** `/api/v1/b2b/inventory/search` — availability with the agency's price, never Mashkoor's cost. */
@PortalController("b2b", "inventory")
@RequireFeatures("bookings")
export class B2BInventoryController {
  constructor(
    private readonly availability: InventoryAvailabilityService,
    private readonly pricing: PricingService,
  ) {}

  @Get("search")
  async search(@Query(new ZodPipe(b2bSearchQuery)) query: z.output<typeof b2bSearchQuery>) {
    if (query.kind === "FLIGHT") {
      const flights = await this.availability.searchFlights(query);
      return Promise.all(
        // Partners see availability and their own price only — no cost, no internal notes, no seat counts.
        flights.map(async ({ costPrice, notes: _notes, totalSeats: _total, bookedSeats: _booked, ...flight }) => ({ ...flight, price: await this.pricing.suggestSellPrice("B2B", query.productType, costPrice ?? 0) })),
      );
    }
    const rooms = await this.availability.searchRooms(query);
    return Promise.all(
      rooms.map(async (room) => ({
        hotel: room.hotel,
        roomType: room.roomType,
        stay: { id: room.ratePeriod.id, startDate: room.ratePeriod.startDate, endDate: room.ratePeriod.endDate, available: room.ratePeriod.available },
        price: await this.pricing.suggestSellPrice("B2B", query.productType, room.ratePeriod.costPrice ?? 0),
      })),
    );
  }
}
