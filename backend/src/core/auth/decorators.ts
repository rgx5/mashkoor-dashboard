import { applyDecorators, Controller, createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Portal } from "@mashkoor/shared";
import type { RequestUser } from "./request-user";

export const PORTAL_KEY = "mashkoor:portal";
export const PUBLIC_KEY = "mashkoor:public";
export const PORTAL_FROM_PARAM_KEY = "mashkoor:portal-from-param";

/**
 * Controller mounted under a portal root, e.g. `@PortalController("admin", "users")` → `/api/v1/admin/users`.
 * Every route requires an access token whose audience is that portal.
 */
export const PortalController = (portal: Portal, path: string) =>
  applyDecorators(Controller(`${portal}/${path}`), SetMetadata(PORTAL_KEY, portal), ApiTags(`${portal} · ${path}`), ApiBearerAuth());

/** Unauthenticated route (login, public website endpoints, webhooks, health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Authenticated route whose portal comes from the `:portal` URL param (e.g. `/auth/:portal/me`). */
export const PortalFromParam = () => SetMetadata(PORTAL_FROM_PARAM_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  return ctx.switchToHttp().getRequest().user;
});
