import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { publicEnquirySchema, type PublicEnquiry } from "@mashkoor/shared";
import { Public } from "../../../core/auth/decorators";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { LeadIntakeService } from "../domain/lead-intake.service";

/**
 * `POST /api/v1/public/enquiries` — called server-side by the website (mashkoor-website).
 * Returns only a reference number; never internal IDs or owner details.
 */
@ApiTags("public · enquiries")
@Public()
@Controller("public/enquiries")
export class PublicEnquiriesController {
  constructor(private readonly intake: LeadIntakeService) {}

  @Post()
  @HttpCode(201)
  // Requests arrive from the website's server, so this is a ceiling for the whole site;
  // per-visitor limits, honeypot and Turnstile run on the website before it calls us.
  @Throttle({ default: { limit: 600, ttl: 60 * 60_000 } })
  async create(@Body(new ZodPipe(publicEnquirySchema)) body: PublicEnquiry) {
    const result = await this.intake.fromWebsite(body);
    return { reference: result.refNo, received: true };
  }
}
