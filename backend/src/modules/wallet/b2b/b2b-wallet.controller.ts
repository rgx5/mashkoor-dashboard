import { Get, Query } from "@nestjs/common";
import { walletLedgerQuerySchema, type WalletLedgerQuery } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { WalletService } from "../domain/wallet.service";

/** `/api/v1/b2b/wallet` — the agency's own balance and ledger. */
@PortalController("b2b", "wallet")
export class B2BWalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  summary(@CurrentUser() actor: RequestUser) {
    if (!actor.partnerId) throw AppError.forbidden();
    return this.wallet.summary(actor, actor.partnerId);
  }

  @Get("ledger")
  ledger(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(walletLedgerQuerySchema)) query: WalletLedgerQuery) {
    if (!actor.partnerId) throw AppError.forbidden();
    return this.wallet.ledger(actor, actor.partnerId, query.page, query.pageSize);
  }
}
