import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { PORTALS, type AccessTokenClaims, type Portal } from "@mashkoor/shared";
import type { Request } from "express";
import { AppConfig } from "../config/app-config.service";
import { AppError } from "../http/app-error";
import { PORTAL_FROM_PARAM_KEY, PORTAL_KEY, PUBLIC_KEY } from "./decorators";
import { AuthStateService } from "./auth-state.service";
import type { RequestUser } from "./request-user";

/**
 * Global guard. Every non-public route must declare its portal; the token's audience must match it.
 * An admin token is rejected on /b2b/*, a b2b token on /admin/*, and so on.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly authState: AuthStateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const requiredPortal = this.resolvePortal(req, targets);
    if (!requiredPortal) {
      // Fail closed: a route that forgot to declare its portal is never reachable.
      throw AppError.forbidden("Route is not assigned to a portal");
    }

    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw AppError.unauthenticated();

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.get("JWT_ACCESS_SECRET"),
        audience: requiredPortal,
        algorithms: ["HS256"],
      });
    } catch {
      throw AppError.unauthenticated("Your session has expired. Please sign in again.");
    }

    // The token is only proof of who signed in. Whether they may still act is the database's call.
    const state = await this.authState.get(claims.sub);
    if (!state.active) throw AppError.unauthenticated("Your account is no longer active. Please contact your administrator.");
    if (state.role !== claims.role || state.partnerId !== (claims.partnerId ?? null) || state.customerId !== (claims.customerId ?? null)) {
      throw AppError.unauthenticated("Your access changed. Please sign in again.");
    }

    req.user = {
      id: claims.sub,
      portal: claims.aud,
      role: claims.role,
      partnerId: claims.partnerId ?? null,
      customerId: claims.customerId ?? null,
      features: state.features,
    };
    return true;
  }

  private resolvePortal(req: Request, targets: Parameters<Reflector["getAllAndOverride"]>[1]): Portal | undefined {
    const fromMetadata = this.reflector.getAllAndOverride<Portal>(PORTAL_KEY, targets);
    if (fromMetadata) return fromMetadata;
    if (this.reflector.getAllAndOverride<boolean>(PORTAL_FROM_PARAM_KEY, targets)) {
      const param = req.params?.portal;
      return typeof param === "string" && (PORTALS as readonly string[]).includes(param) ? (param as Portal) : undefined;
    }
    return undefined;
  }
}
