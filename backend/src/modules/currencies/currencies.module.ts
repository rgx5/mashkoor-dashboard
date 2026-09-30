import { Module } from "@nestjs/common";
import { AdminCurrenciesController } from "./admin/admin-currencies.controller";
import { CurrenciesService } from "./domain/currencies.service";

/** Currencies a quotation line can be priced in, and today's rate to INR. */
@Module({
  controllers: [AdminCurrenciesController],
  providers: [CurrenciesService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
