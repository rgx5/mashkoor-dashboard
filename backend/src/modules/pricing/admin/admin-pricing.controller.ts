import { Body, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { pricingRuleInputSchema, pricingRuleUpdateSchema, priceQuoteSchema, type PriceQuoteInput, type PricingRuleData, type PricingRuleUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { PricingService } from "../domain/pricing.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `/api/v1/admin/pricing-rules` */
@PortalController("admin", "pricing-rules")
@RequireFeatures("bookings")
export class AdminPricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @CheckAbility("read", "PricingRule")
  list(@CurrentUser() actor: RequestUser) {
    return this.pricing.list(actor);
  }

  @Post("quote")
  @CheckAbility("read", "PricingRule")
  quote(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(priceQuoteSchema)) body: PriceQuoteInput) {
    return this.pricing.quote(actor, body);
  }

  @Post()
  @CheckAbility("create", "PricingRule")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(pricingRuleInputSchema)) body: PricingRuleData) {
    return this.pricing.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "PricingRule")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(pricingRuleUpdateSchema)) body: PricingRuleUpdateData) {
    return this.pricing.update(actor, id, body);
  }

  @Delete(":id")
  @CheckAbility("delete", "PricingRule")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.pricing.remove(actor, id);
  }
}
