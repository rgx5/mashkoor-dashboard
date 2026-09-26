import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FeatureName } from "@mashkoor/shared";
import type { Request } from "express";
import { PORTAL_KEY } from "../auth/decorators";
import { AppConfig } from "../config/app-config.service";
import { AppError } from "../http/app-error";
import { FEATURES_KEY } from "./require-features";

/**
 * Global guard: a route that belongs to a switched-off feature behaves as if it did not exist (404) — for everyone,
 * signed in or not. Keeps unfinished or unused areas closed in production without removing any code.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const needed = new Set<FeatureName>(this.reflector.getAllAndMerge<FeatureName[]>(FEATURES_KEY, targets) ?? []);

    // Whole portals: the partner portal is the `b2b` feature, the customer portal is `portal`.
    const portal = this.reflector.getAllAndOverride<string>(PORTAL_KEY, targets);
    if (portal === "b2b") needed.add("b2b");
    if (portal === "b2c") needed.add("portal");

    // Sign-in routes are shared (`/auth/:portal/...`), so look at the path too.
    const req = context.switchToHttp().getRequest<Request>();
    const url = req.originalUrl ?? req.url ?? "";
    if (/\/auth\/b2b(\/|\?|$)/.test(url)) needed.add("b2b");
    if (/\/auth\/b2c(\/|\?|$)/.test(url)) needed.add("portal");

    if (needed.size > 0 && !this.config.hasFeatures(...needed)) throw AppError.notFound("Page");
    return true;
  }
}
