import { Body, Get, Patch } from "@nestjs/common";
import { partnerUpdateSchema, type PartnerUpdateData } from "@mashkoor/shared";
import type { z } from "zod";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { PartnersService } from "../domain/partners.service";

/** `/api/v1/b2b/profile` — the agency's own profile and KYC documents. Credit limit isn't editable here. */
const b2bProfileSchema = partnerUpdateSchema.omit({ creditLimit: true, internalNotes: true });

@PortalController("b2b", "profile")
export class B2BPartnerProfileController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  get(@CurrentUser() actor: RequestUser) {
    if (!actor.partnerId) throw AppError.forbidden();
    return this.partners.get(actor, actor.partnerId);
  }

  @Patch()
  update(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(b2bProfileSchema)) body: z.output<typeof b2bProfileSchema>) {
    if (!actor.partnerId) throw AppError.forbidden();
    return this.partners.update(actor, actor.partnerId, body as PartnerUpdateData);
  }
}
