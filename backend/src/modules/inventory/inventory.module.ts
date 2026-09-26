import { Module } from "@nestjs/common";
import { PricingModule } from "../pricing/pricing.module";
import { AdminFlightInventoryController } from "./admin/admin-flight-inventory.controller";
import { AdminHotelsController } from "./admin/admin-hotels.controller";
import { AdminInventorySearchController } from "./admin/admin-inventory-search.controller";
import { B2BInventoryController } from "./b2b/b2b-inventory.controller";
import { FlightInventoryService } from "./domain/flight-inventory.service";
import { HotelsService } from "./domain/hotels.service";
import { InventoryAvailabilityService } from "./domain/inventory-availability.service";

/** M05 · Inventory: hotels → room types → rate periods, and flight seat blocks. Exports the guarded
 * reserve/release logic and search so BookingsModule can use inventory without touching its tables. */
@Module({
  imports: [PricingModule],
  controllers: [AdminHotelsController, AdminFlightInventoryController, AdminInventorySearchController, B2BInventoryController],
  providers: [HotelsService, FlightInventoryService, InventoryAvailabilityService],
  exports: [HotelsService, FlightInventoryService, InventoryAvailabilityService],
})
export class InventoryModule {}
