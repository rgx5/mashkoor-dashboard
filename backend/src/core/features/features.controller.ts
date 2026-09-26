import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { PublicFeatures } from "@mashkoor/shared";
import { Public } from "../auth/decorators";
import { AppConfig } from "../config/app-config.service";

/** `GET /api/v1/public/features` — which optional areas are switched on, so the dashboard can hide the rest. */
@ApiTags("public · features")
@Public()
@Controller("public/features")
export class FeaturesController {
  constructor(private readonly config: AppConfig) {}

  @Get()
  get(): PublicFeatures {
    return { features: [...this.config.features] };
  }
}
