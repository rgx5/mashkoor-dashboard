import { Module } from "@nestjs/common";
import { AdminFinanceController } from "./admin/admin-finance.controller";
import { FinanceService } from "./domain/finance.service";

/** Accounts: the ledger of every rupee in and out, supplier payments and expenses, and what is owed each way. */
@Module({
  controllers: [AdminFinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
