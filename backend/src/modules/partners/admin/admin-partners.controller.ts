import { RequireFeatures } from "../../../core/features/require-features";
import { Body, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  partnerInviteAdminSchema,
  partnerListQuerySchema,
  partnerRejectSchema,
  partnerSuspendSchema,
  partnerUserInviteSchema,
  partnerUpdateSchema,
  type PartnerListQuery,
  type PartnerUserInvite,
  type PartnerUpdateData,
} from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { PartnerUsersService } from "../domain/partner-users.service";
import { PartnersService } from "../domain/partners.service";

/** `/api/v1/admin/partners` — applications queue, approvals, KYC review. */
@PortalController("admin", "partners")
@RequireFeatures("b2b")
export class AdminPartnersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly users: PartnerUsersService,
  ) {}

  @Get()
  @CheckAbility("read", "Partner")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(partnerListQuerySchema)) query: PartnerListQuery) {
    return this.partners.list(actor, query);
  }

  @Get(":id")
  @CheckAbility("read", "Partner")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.partners.get(actor, id);
  }

  @Patch(":id")
  @CheckAbility("update", "Partner")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(partnerUpdateSchema)) body: PartnerUpdateData) {
    return this.partners.update(actor, id, body);
  }

  @Post(":id/approve")
  @CheckAbility("manage", "Partner")
  approve(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.partners.approve(actor, id);
  }

  @Post(":id/reject")
  @CheckAbility("manage", "Partner")
  reject(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(partnerRejectSchema)) body: { reason: string }) {
    return this.partners.reject(actor, id, body.reason);
  }

  @Post(":id/suspend")
  @CheckAbility("manage", "Partner")
  suspend(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(partnerSuspendSchema)) body: { reason: string }) {
    return this.partners.suspend(actor, id, body.reason);
  }

  @Post(":id/reinstate")
  @CheckAbility("manage", "Partner")
  reinstate(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.partners.reinstate(actor, id);
  }

  @Post(":id/invite-admin")
  @CheckAbility("manage", "Partner")
  inviteAdmin(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(partnerInviteAdminSchema)) body: { name: string; email: string }) {
    return this.partners.inviteAdmin(actor, id, body.name, body.email);
  }

  @Get(":id/users")
  @CheckAbility("read", "Partner")
  listUsers(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.list(actor, id);
  }

  @Post(":id/users")
  @CheckAbility("manage", "Partner")
  inviteUser(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(partnerUserInviteSchema)) body: PartnerUserInvite) {
    return this.users.invite(actor, id, body);
  }

  @Post(":id/users/:userId/disable")
  @HttpCode(200)
  @CheckAbility("manage", "Partner")
  disableUser(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.users.setStatus(actor, id, userId, "DISABLED");
  }

  @Post(":id/users/:userId/enable")
  @HttpCode(200)
  @CheckAbility("manage", "Partner")
  enableUser(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.users.setStatus(actor, id, userId, "ACTIVE");
  }

  @Post(":id/users/:userId/resend-invite")
  @HttpCode(200)
  @CheckAbility("manage", "Partner")
  resendUserInvite(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.users.resendInvite(actor, id, userId);
  }
}
