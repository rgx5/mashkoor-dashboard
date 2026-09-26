import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hasFeatures, parseFeatures, type FeatureName } from "@mashkoor/shared";
import type { Env } from "./env";

/** Typed access to validated environment variables. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  private enabled?: FeatureName[];

  /** The optional areas that are switched on (ENABLED_FEATURES). */
  get features(): readonly FeatureName[] {
    return (this.enabled ??= parseFeatures(this.get("ENABLED_FEATURES")).features);
  }

  /** True when every one of `needed` is switched on. */
  hasFeatures(...needed: FeatureName[]) {
    return hasFeatures(this.features, needed);
  }

  get isProduction() {
    return this.get("NODE_ENV") === "production";
  }
}
