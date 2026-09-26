import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { ActivitiesModule } from "../activities/activities.module";
import { AdminCustomersController } from "./admin/admin-customers.controller";
import { B2BCustomersController } from "./b2b/b2b-customers.controller";
import { B2CProfileController } from "./b2c/b2c-profile.controller";
import { CustomerAccountsService } from "./domain/customer-accounts.service";
import { CustomersService } from "./domain/customers.service";
import { TravelersService } from "./domain/travelers.service";

/** M01 · Customers & Travellers. Admin, B2B (agency customers) and B2C (own profile + family travellers) slices. */
@Module({
  imports: [ActivitiesModule, AuthModule],
  controllers: [AdminCustomersController, B2BCustomersController, B2CProfileController],
  providers: [CustomersService, TravelersService, CustomerAccountsService],
  exports: [CustomersService, TravelersService, CustomerAccountsService],
})
export class CustomersModule {}
