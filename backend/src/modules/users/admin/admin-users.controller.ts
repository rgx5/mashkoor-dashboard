import { Body, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  createStaffUserSchema,
  listQuerySchema,
  STAFF_ROLES,
  updateStaffUserSchema,
  USER_STATUSES,
  type CreateStaffUserInput,
  type UpdateStaffUserInput,
} from "@mashkoor/shared";
import { z } from "zod";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { UsersService, type StaffListQuery } from "../domain/users.service";

const staffListQuery = listQuerySchema.extend({
  role: z.enum(STAFF_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

/** Staff user management — `/api/v1/admin/users`. */
@PortalController("admin", "users")
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @CheckAbility("read", "User")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(staffListQuery)) query: StaffListQuery) {
    return this.users.listStaff(actor, query);
  }

  /** Active staff for owner / assignee pickers. Anyone who works leads can see the list of names. */
  @Get("options")
  @CheckAbility("read", "Lead")
  options() {
    return this.users.staffOptions();
  }

  @Get(":id")
  @CheckAbility("read", "User")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.getStaff(actor, id);
  }

  @Post()
  @CheckAbility("create", "User")
  invite(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(createStaffUserSchema)) body: CreateStaffUserInput) {
    return this.users.inviteStaff(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "User")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateStaffUserSchema)) body: UpdateStaffUserInput) {
    return this.users.updateStaff(actor, id, body);
  }

  @Post(":id/disable")
  @HttpCode(200)
  @CheckAbility("disable", "User")
  disable(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.setStatus(actor, id, "DISABLED");
  }

  @Post(":id/enable")
  @HttpCode(200)
  @CheckAbility("disable", "User")
  enable(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.setStatus(actor, id, "ACTIVE");
  }

  @Post(":id/resend-invite")
  @HttpCode(200)
  @CheckAbility("invite", "User")
  resendInvite(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.users.resendInvite(actor, id);
  }
}
