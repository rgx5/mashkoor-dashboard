import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import { subject } from "@casl/ability";
import { isStaffFeature, STAFF_FEATURE_INFO, STAFF_FEATURES, STAFF_ROLES, type CreateStaffUserInput, type ListQuery, type Paginated, type Role, type SessionUser, type StaffAccessData, type StaffAccessMatrix, type UpdateStaffUserInput, type UserStatus } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../../../core/audit/audit.service";
import { AuthService, toSessionUser } from "../../../core/auth/auth.service";
import { AuthStateService } from "../../../core/auth/auth-state.service";
import { hashPassword } from "../../../core/auth/crypto";
import type { RequestUser } from "../../../core/auth/request-user";
import { TokenService } from "../../../core/auth/token.service";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

export type StaffListQuery = ListQuery & { role?: Role; status?: UserStatus };

const SORTABLE = new Set(["name", "email", "createdAt", "lastLoginAt"]);

export type StaffUserRow = SessionUser & { lastLoginAt: Date | null; createdAt: Date };

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly authState: AuthStateService,
  ) {}

  async listStaff(actor: RequestUser, query: StaffListQuery): Promise<Paginated<StaffUserRow>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.UserWhereInput = {
      AND: [
        accessibleBy(ability).User,
        { type: "STAFF" },
        query.role ? { role: query.role } : {},
        query.status ? { status: query.status } : {},
        query.q
          ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { email: { contains: query.q, mode: "insensitive" } }, { phone: { contains: query.q } }] }
          : {},
      ],
    };
    const sortField = query.sort?.replace(/^-/, "");
    const orderBy: Prisma.UserOrderByWithRelationInput =
      sortField && SORTABLE.has(sortField) ? { [sortField]: query.sort!.startsWith("-") ? "desc" : "asc" } : { createdAt: "desc" };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: rows.map((u) => ({ ...toSessionUser(u), lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  staffOptions() {
    return this.prisma.user.findMany({
      where: { type: "STAFF", status: "ACTIVE" },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
  }

  /** Every staff member with the dashboard areas switched on for them, and the areas their role could use at all. */
  async accessMatrix(): Promise<StaffAccessMatrix> {
    const staff = await this.prisma.user.findMany({ where: { type: "STAFF", status: { not: "DISABLED" } }, orderBy: [{ name: "asc" }] });
    return {
      features: STAFF_FEATURES.map((f) => STAFF_FEATURE_INFO[f]),
      staff: staff.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        fullAccess: u.role === "SUPER_ADMIN",
        features: u.featureAccess.filter(isStaffFeature),
        available: u.role === "SUPER_ADMIN" ? [...STAFF_FEATURES] : this.abilities.featuresAvailableFor(u.role, u.id),
      })),
    };
  }

  async setAccess(actor: RequestUser, id: string, input: StaffAccessData) {
    const before = await this.findAccessible(actor, id, "update");
    if (before.role === "SUPER_ADMIN") throw AppError.conflict("Super admins always have full access");
    if (!(STAFF_ROLES as readonly string[]).includes(before.role)) throw AppError.conflict("Only staff have dashboard areas");
    const user = await this.prisma.user.update({ where: { id }, data: { featureAccess: input.features } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "user.access_changed", entityType: "User", entityId: id, before: { features: before.featureAccess }, after: { features: user.featureAccess } });
    // Effective on their very next request; their screens pick it up the next time the app loads.
    this.authState.invalidate(id);
    return toSessionUser(user);
  }

  async getStaff(actor: RequestUser, id: string): Promise<StaffUserRow> {
    const user = await this.findAccessible(actor, id, "read");
    return { ...toSessionUser(user), lastLoginAt: user.lastLoginAt, createdAt: user.createdAt };
  }

  async inviteStaff(actor: RequestUser, input: CreateStaffUserInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw AppError.conflict("A user with this email already exists");

    // With a password the admin has chosen, the account works straight away and no email is sent. Hand the password to the person yourself.
    const user = await this.prisma.user.create({
      data: {
        type: "STAFF",
        role: input.role,
        name: input.name,
        email: input.email,
        phone: input.phone,
        status: input.password ? "ACTIVE" : "INVITED",
        passwordHash: input.password ? await hashPassword(input.password) : undefined,
        createdById: actor.id,
      },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "user.created", entityType: "User", entityId: user.id, after: { ...toSessionUser(user), passwordSetByAdmin: Boolean(input.password) } });
    if (!input.password) await this.auth.sendInvite(user, actor.id);
    return toSessionUser(user);
  }

  async updateStaff(actor: RequestUser, id: string, input: UpdateStaffUserInput) {
    const before = await this.findAccessible(actor, id, "update");
    if (input.role && before.id === actor.id && input.role !== before.role) {
      throw AppError.forbidden("You can't change your own role");
    }
    const user = await this.prisma.user.update({ where: { id }, data: input });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "user.updated", entityType: "User", entityId: id, before: toSessionUser(before), after: toSessionUser(user) });
    if (input.role && input.role !== before.role) await this.tokens.revokeAllForUser(id); // new permissions on next sign-in
    return toSessionUser(user);
  }

  async setStatus(actor: RequestUser, id: string, status: "ACTIVE" | "DISABLED") {
    const before = await this.findAccessible(actor, id, "disable");
    if (status === "ACTIVE" && !before.passwordHash) throw AppError.conflict("This user hasn't accepted their invitation yet");
    const user = await this.prisma.user.update({ where: { id }, data: { status, disabledReason: status === "DISABLED" ? "MANUAL" : null } });
    if (status === "DISABLED") {
      // A pending invite link must not be able to switch the account back on.
      await this.prisma.userToken.updateMany({ where: { userId: id, purpose: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
      await this.tokens.revokeAllForUser(id);
    }
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: status === "DISABLED" ? "user.disabled" : "user.enabled", entityType: "User", entityId: id });
    return toSessionUser(user);
  }

  async resendInvite(actor: RequestUser, id: string) {
    const user = await this.findAccessible(actor, id, "invite");
    if (user.status !== "INVITED") throw AppError.conflict("This user has already accepted their invitation");
    await this.auth.sendInvite(user, actor.id);
    return { message: "Invitation sent" };
  }

  private async findAccessible(actor: RequestUser, id: string, action: "read" | "update" | "disable" | "invite") {
    const user = await this.prisma.user.findFirst({ where: { id, type: "STAFF" } });
    if (!user) throw AppError.notFound("User");
    if (!this.abilities.forUser(actor).can(action, subject("User", user))) throw AppError.forbidden();
    return user;
  }
}
