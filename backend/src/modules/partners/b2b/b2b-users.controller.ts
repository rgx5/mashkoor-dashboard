import { Body, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { partnerUserInviteSchema, type PartnerUserInvite } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { PartnerUsersService } from "../domain/partner-users.service";

/** `/api/v1/b2b/users` — an agency's Admin managing its own team. Every call is pinned to the caller's own agency. */
@PortalController("b2b", "users")
export class B2BUsersController {
  constructor(private readonly users: PartnerUsersService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser) {
    return this.users.list(actor, this.users.resolvePartnerId(actor));
  }

  @Post()
  invite(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(partnerUserInviteSchema)) body: PartnerUserInvite) {
    return this.users.invite(actor, this.users.resolvePartnerId(actor), body);
  }

  @Post(":userId/disable")
  @HttpCode(200)
  disable(@CurrentUser() actor: RequestUser, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.users.setStatus(actor, this.users.resolvePartnerId(actor), userId, "DISABLED");
  }

  @Post(":userId/enable")
  @HttpCode(200)
  enable(@CurrentUser() actor: RequestUser, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.users.setStatus(actor, this.users.resolvePartnerId(actor), userId, "ACTIVE");
  }

  @Post(":userId/resend-invite")
  @HttpCode(200)
  resend(@CurrentUser() actor: RequestUser, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.users.resendInvite(actor, this.users.resolvePartnerId(actor), userId);
  }
}
