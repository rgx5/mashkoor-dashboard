import { Module } from "@nestjs/common";
import { AdminPricingController } from "./admin/admin-pricing.controller";
import { PricingService } from "./domain/pricing.service";

/** M06 · Pricing engine: rules + calculator. Consumed by BookingsModule when items don't set an explicit sell price. */
@Module({
  controllers: [AdminPricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
