import { Module } from "@nestjs/common";
import { AdminForexController } from "./admin/admin-forex.controller";
import { ForexService } from "./domain/forex.service";

/** The forex desk: rates, stock, customer transactions and dealer purchases. Its rupee movements feed the Accounts ledger. */
@Module({
  controllers: [AdminForexController],
  providers: [ForexService],
  exports: [ForexService],
})
export class ForexModule {}
