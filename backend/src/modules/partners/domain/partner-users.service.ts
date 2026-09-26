import { HttpStatus, Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { ERROR_CODES, type PartnerUserInvite, type PartnerUserRow } from "@mashkoor/shared";
import type { User } from "@prisma/client";
import { toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import { AuthService } from "../../../core/auth/auth.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { TokenService } from "../../../core/auth/token.service";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toRow = (u: User): PartnerUserRow => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role as PartnerUserRow["role"],
  status: u.status as PartnerUserRow["status"],
  lastLoginAt: toIso(u.lastLoginAt),
});

/**
 * Agency users. A partner's own Admin manages them from the B2B portal; Mashkoor staff can do the same for any agency
 * from the partner page. Both go through here so the rules — same partner only, never yourself, approved partners
 * only — are written once.
 */
@Injectable()
export class PartnerUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /** The B2B portal always works on the caller's own agency; staff name the agency explicitly. */
  resolvePartnerId(actor: RequestUser, partnerId?: string): string {
    if (actor.portal === "b2b") {
      if (!actor.partnerId) throw AppError.forbidden();
      return actor.partnerId;
    }
    if (!partnerId) throw new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED, "Choose an agency");
    return partnerId;
  }

  async list(actor: RequestUser, partnerId: string): Promise<PartnerUserRow[]> {
    this.assert(actor, partnerId, "read");
    const users = await this.prisma.user.findMany({ where: { partnerId, type: "PARTNER" }, orderBy: [{ role: "asc" }, { name: "asc" }] });
    return users.map(toRow);
  }

  async invite(actor: RequestUser, partnerId: string, input: PartnerUserInvite): Promise<PartnerUserRow> {
    this.assert(actor, partnerId, "create");
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw AppError.notFound("Agency");
    if (partner.status !== "APPROVED") throw AppError.conflict("Users can be added once the agency is approved");
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) throw AppError.conflict("Someone with this email already has an account");

    const user = await this.prisma.user.create({
      data: { type: "PARTNER", role: input.role, name: input.name, email: input.email, partnerId, status: "INVITED", createdById: actor.id },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "partner.user_invited", entityType: "Partner", entityId: partnerId, after: { email: input.email, role: input.role } });
    await this.auth.sendInvite(user, actor.id);
    return toRow(user);
  }

  async setStatus(actor: RequestUser, partnerId: string, userId: string, status: "ACTIVE" | "DISABLED"): Promise<PartnerUserRow> {
    const target = await this.find(partnerId, userId);
    this.assert(actor, partnerId, "disable", target);
    if (target.id === actor.id) throw AppError.conflict("You can't disable your own account");
    if (status === "ACTIVE" && !target.passwordHash) throw AppError.conflict("This user hasn't accepted their invitation yet");
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status, disabledReason: status === "DISABLED" ? "MANUAL" : null } });
    if (status === "DISABLED") {
      await this.prisma.userToken.updateMany({ where: { userId, purpose: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
      await this.tokens.revokeAllForUser(userId);
    }
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: status === "DISABLED" ? "partner.user_disabled" : "partner.user_enabled", entityType: "User", entityId: userId });
    return toRow(user);
  }

  async resendInvite(actor: RequestUser, partnerId: string, userId: string) {
    const target = await this.find(partnerId, userId);
    this.assert(actor, partnerId, "invite", target);
    if (target.status !== "INVITED") throw AppError.conflict("This user has already accepted their invitation");
    await this.auth.sendInvite(target, actor.id);
    return { message: "Invitation sent" };
  }

  private async find(partnerId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, partnerId, type: "PARTNER" } });
    if (!user) throw AppError.notFound("User");
    return user;
  }

  private assert(actor: RequestUser, partnerId: string, action: "read" | "create" | "disable" | "invite", target?: User) {
    const ability = this.abilities.forUser(actor);
    if (actor.portal === "admin") {
      if (ability.can("manage", "Partner")) return;
      throw AppError.forbidden();
    }
    if (actor.portal !== "b2b" || actor.partnerId !== partnerId) throw AppError.forbidden();
    if (!ability.can(action, subject("User", target ?? ({ partnerId, type: "PARTNER" } as User)))) throw AppError.forbidden();
  }
}
