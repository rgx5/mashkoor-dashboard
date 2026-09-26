import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RequestUser } from "../auth/request-user";
import { AppError } from "../http/app-error";
import { AbilityFactory, type Action, type AppAbility, type AppSubjects } from "./ability.factory";

export const ABILITY_KEY = "mashkoor:ability";

/**
 * Route-level permission check, e.g. `@CheckAbility("read", "User")`.
 * Record-level conditions (own records, same partner) are enforced in services with `accessibleBy()`.
 */
export const CheckAbility = (action: Action, subject: Extract<AppSubjects, string>) => SetMetadata(ABILITY_KEY, { action, subject });

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilities: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<{ action: Action; subject: Extract<AppSubjects, string> }>(ABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<{ user?: RequestUser; ability?: AppAbility }>();
    if (!req.user) throw AppError.unauthenticated();

    const ability = this.abilities.forUser(req.user);
    req.ability = ability;
    if (!ability.can(required.action, required.subject)) throw AppError.forbidden();
    return true;
  }
}
