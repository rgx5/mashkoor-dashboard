import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { CustomersModule } from "../customers/customers.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PaymentsModule } from "../payments/payments.module";
import { PricingModule } from "../pricing/pricing.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminBookingsController } from "./admin/admin-bookings.controller";
import { B2BBookingsController } from "./b2b/b2b-bookings.controller";
import { B2CTripsController } from "./b2c/b2c-trips.controller";
import { BookingsService } from "./domain/bookings.service";
import { PublicBookingController } from "./public/public-booking.controller";
import { PublicBookingService } from "./public/public-booking.service";

/** M07 · Bookings: register, wizard, status workflow. Builds on Customers, Inventory, Pricing, Wallet (B2B debit/refund) and Payments (B2C dues). */
@Module({
  imports: [ActivitiesModule, CustomersModule, InventoryModule, PricingModule, WalletModule, PaymentsModule],
  controllers: [AdminBookingsController, B2BBookingsController, B2CTripsController, PublicBookingController],
  providers: [BookingsService, PublicBookingService],
  exports: [BookingsService],
})
export class BookingsModule {}
