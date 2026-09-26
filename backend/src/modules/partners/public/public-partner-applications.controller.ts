import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { publicPartnerApplicationSchema, type PartnerApplicationInput } from "@mashkoor/shared";
import { Public } from "../../../core/auth/decorators";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { PartnersService } from "../domain/partners.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `POST /api/v1/public/partner-applications` — the website's "Become an agent" form. */
@ApiTags("public · partners")
@Public()
@Throttle({ default: { limit: 100, ttl: 60 * 60_000 } })
@Controller("public/partner-applications")
@RequireFeatures("b2b")
export class PublicPartnerApplicationsController {
  constructor(private readonly partners: PartnersService) {}

  @Post()
  @HttpCode(201)
  async apply(@Body(new ZodPipe(publicPartnerApplicationSchema)) body: PartnerApplicationInput) {
    const result = await this.partners.apply(body);
    return { reference: result.refNo, received: true };
  }
}
