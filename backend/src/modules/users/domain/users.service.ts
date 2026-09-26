import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import { subject } from "@casl/ability";
import type { CreateStaffUserInput, ListQuery, Paginated, Role, SessionUser, UpdateStaffUserInput, UserStatus } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { AuditService } from "../../../core/audit/audit.service";
import { AuthService, toSessionUser } from "../../../core/auth/auth.service";
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

  async getStaff(actor: RequestUser, id: string): Promise<StaffUserRow> {
    const user = await this.findAccessible(actor, id, "read");
    return { ...toSessionUser(user), lastLoginAt: user.lastLoginAt, createdAt: user.createdAt };
  }

  async inviteStaff(actor: RequestUser, input: CreateStaffUserInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw AppError.conflict("A user with this email already exists");

    const user = await this.prisma.user.create({
      data: { type: "STAFF", role: input.role, name: input.name, email: input.email, phone: input.phone, status: "INVITED", createdById: actor.id },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "user.created", entityType: "User", entityId: user.id, after: toSessionUser(user) });
    await this.auth.sendInvite(user, actor.id);
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
