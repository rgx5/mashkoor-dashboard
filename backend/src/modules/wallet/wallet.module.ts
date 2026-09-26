import { Module } from "@nestjs/common";
import { AdminWalletController } from "./admin/admin-wallet.controller";
import { B2BWalletController } from "./b2b/b2b-wallet.controller";
import { WalletService } from "./domain/wallet.service";

/** M09 · Wallet & credit. Exports WalletService so BookingsModule can debit/refund B2B bookings. */
@Module({
  controllers: [AdminWalletController, B2BWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
