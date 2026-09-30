import { Body, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { currencyInputSchema, currencyUpdateSchema, type CurrencyData, type CurrencyUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { CurrenciesService } from "../domain/currencies.service";

/** `/api/v1/admin/currencies` — currencies a quotation line can be priced in, and today's rate to INR. */
@PortalController("admin", "currencies")
export class AdminCurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get()
  @CheckAbility("read", "Currency")
  list(@CurrentUser() actor: RequestUser) {
    return this.currencies.list(actor);
  }

  @Post()
  @CheckAbility("manage", "Currency")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(currencyInputSchema)) body: CurrencyData) {
    return this.currencies.create(actor, body);
  }

  @Patch(":code")
  @CheckAbility("manage", "Currency")
  update(@CurrentUser() actor: RequestUser, @Param("code") code: string, @Body(new ZodPipe(currencyUpdateSchema)) body: CurrencyUpdateData) {
    return this.currencies.update(actor, code.toUpperCase(), body);
  }

  @Delete(":code")
  @CheckAbility("manage", "Currency")
  remove(@CurrentUser() actor: RequestUser, @Param("code") code: string) {
    return this.currencies.remove(actor, code.toUpperCase());
  }
}
