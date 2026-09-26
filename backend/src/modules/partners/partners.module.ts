import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminPartnersController } from "./admin/admin-partners.controller";
import { B2BPartnerProfileController } from "./b2b/b2b-partner-profile.controller";
import { B2BUsersController } from "./b2b/b2b-users.controller";
import { PartnerUsersService } from "./domain/partner-users.service";
import { PartnersService } from "./domain/partners.service";
import { PublicPartnerApplicationsController } from "./public/public-partner-applications.controller";

/** M08 · Partners & KYC. */
@Module({
  imports: [AuthModule, WalletModule],
  controllers: [AdminPartnersController, B2BPartnerProfileController, B2BUsersController, PublicPartnerApplicationsController],
  providers: [PartnersService, PartnerUsersService],
  exports: [PartnersService],
})
export class PartnersModule {}
