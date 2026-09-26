import { Body, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { walletAdjustSchema, walletCreditLimitSchema, walletLedgerQuerySchema, walletTopUpSchema, type WalletAdjustInput, type WalletCreditLimitInput, type WalletLedgerQuery, type WalletTopUpInput } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { WalletService } from "../domain/wallet.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `/api/v1/admin/partners/:partnerId/wallet` — top-ups, adjustments, credit limit, ledger. */
@PortalController("admin", "partners/:partnerId/wallet")
@RequireFeatures("b2b")
export class AdminWalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @CheckAbility("read", "Partner")
  summary(@CurrentUser() actor: RequestUser, @Param("partnerId", ParseUUIDPipe) partnerId: string) {
    return this.wallet.summary(actor, partnerId);
  }

  @Get("ledger")
  @CheckAbility("read", "Partner")
  ledger(@CurrentUser() actor: RequestUser, @Param("partnerId", ParseUUIDPipe) partnerId: string, @Query(new ZodPipe(walletLedgerQuerySchema)) query: WalletLedgerQuery) {
    return this.wallet.ledger(actor, partnerId, query.page, query.pageSize);
  }

  @Post("topup")
  @CheckAbility("manage", "Partner")
  topUp(@CurrentUser() actor: RequestUser, @Param("partnerId", ParseUUIDPipe) partnerId: string, @Body(new ZodPipe(walletTopUpSchema)) body: WalletTopUpInput) {
    return this.wallet.topUp(actor, partnerId, body);
  }

  @Post("adjust")
  @CheckAbility("manage", "Partner")
  adjust(@CurrentUser() actor: RequestUser, @Param("partnerId", ParseUUIDPipe) partnerId: string, @Body(new ZodPipe(walletAdjustSchema)) body: WalletAdjustInput) {
    return this.wallet.adjust(actor, partnerId, body);
  }

  @Post("credit-limit")
  @CheckAbility("manage", "Partner")
  creditLimit(@CurrentUser() actor: RequestUser, @Param("partnerId", ParseUUIDPipe) partnerId: string, @Body(new ZodPipe(walletCreditLimitSchema)) body: WalletCreditLimitInput) {
    return this.wallet.setCreditLimit(actor, partnerId, body.creditLimit);
  }
}
