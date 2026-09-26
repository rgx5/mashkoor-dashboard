import { Body, Get, Param, ParseUUIDPipe, Patch, Post, Delete } from "@nestjs/common";
import { faqInputSchema, faqUpdateSchema, type FaqData, type FaqUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { FaqsService } from "../domain/faqs.service";
import { RevalidatesSite } from "../../../core/site/revalidate.interceptor";
import { RequireFeatures } from "../../../core/features/require-features";

/** `/api/v1/admin/faqs` */
@RevalidatesSite("public")
@PortalController("admin", "faqs")
@RequireFeatures("website")
export class AdminFaqsController {
  constructor(private readonly faqs: FaqsService) {}

  @Get()
  @CheckAbility("read", "Faq")
  list(@CurrentUser() actor: RequestUser) {
    return this.faqs.list(actor);
  }

  @Post()
  @CheckAbility("create", "Faq")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(faqInputSchema)) body: FaqData) {
    return this.faqs.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Faq")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(faqUpdateSchema)) body: FaqUpdateData) {
    return this.faqs.update(actor, id, body);
  }

  @Delete(":id")
  @CheckAbility("delete", "Faq")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.faqs.remove(actor, id);
  }
}
