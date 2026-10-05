import { Body, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import {
  forexCancelSchema,
  forexPurchaseInputSchema,
  forexPurchaseListQuerySchema,
  forexRatesUpdateSchema,
  forexTransactionInputSchema,
  forexTransactionListQuerySchema,
  type ForexCancelData,
  type ForexPurchaseData,
  type ForexPurchaseListQuery,
  type ForexRatesUpdateData,
  type ForexTransactionData,
  type ForexTransactionListQuery,
} from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { RequireFeatures } from "../../../core/features/require-features";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { ForexService } from "../domain/forex.service";

/** `/api/v1/admin/forex` — the forex desk: rates and stock, sales to customers, and purchases from dealers. */
@PortalController("admin", "forex")
@RequireFeatures("payments")
export class AdminForexController {
  constructor(private readonly forex: ForexService) {}

  @Get("overview")
  @CheckAbility("read", "ForexTransaction")
  overview() {
    return this.forex.overview();
  }

  @Put("rates")
  @CheckAbility("manage", "ForexTransaction")
  updateRates(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(forexRatesUpdateSchema)) body: ForexRatesUpdateData) {
    return this.forex.updateRates(actor, body);
  }

  @Get("transactions")
  @CheckAbility("read", "ForexTransaction")
  transactions(@Query(new ZodPipe(forexTransactionListQuerySchema)) query: ForexTransactionListQuery) {
    return this.forex.listTransactions(query);
  }

  @Post("transactions")
  @CheckAbility("create", "ForexTransaction")
  record(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(forexTransactionInputSchema)) body: ForexTransactionData) {
    return this.forex.createTransaction(actor, body);
  }

  @Post("transactions/:id/cancel")
  @HttpCode(200)
  @CheckAbility("update", "ForexTransaction")
  cancel(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(forexCancelSchema)) body: ForexCancelData) {
    return this.forex.cancelTransaction(actor, id, body.reason);
  }

  @Get("purchases")
  @CheckAbility("read", "ForexTransaction")
  purchases(@Query(new ZodPipe(forexPurchaseListQuerySchema)) query: ForexPurchaseListQuery) {
    return this.forex.listPurchases(query);
  }

  @Post("purchases")
  @CheckAbility("create", "ForexTransaction")
  purchase(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(forexPurchaseInputSchema)) body: ForexPurchaseData) {
    return this.forex.createPurchase(actor, body);
  }

  @Post("purchases/:id/cancel")
  @HttpCode(200)
  @CheckAbility("update", "ForexTransaction")
  cancelPurchase(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(forexCancelSchema)) body: ForexCancelData) {
    return this.forex.cancelPurchase(actor, id, body.reason);
  }
}
