import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import {
  type Paginated,
  type PartnerApplicationInput,
  type PartnerDetail,
  type PartnerListQuery,
  type PartnerRow,
  type PartnerUpdateData,
} from "@mashkoor/shared";
import type { Partner, Prisma } from "@prisma/client";
import { paginate, toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import { AuthService } from "../../../core/auth/auth.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { TokenService } from "../../../core/auth/token.service";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { WalletService } from "../../wallet/domain/wallet.service";

const include = { _count: { select: { users: true } }, wallet: true } satisfies Prisma.PartnerInclude;
type PartnerWithRefs = Prisma.PartnerGetPayload<{ include: typeof include }>;

const toRow = (p: Partner & { _count: { users: number } }): PartnerRow => ({
  id: p.id,
  refNo: p.refNo,
  companyName: p.companyName,
  contactName: p.contactName,
  phone: p.phone,
  email: p.email,
  city: p.city,
  status: p.status,
  userCount: p._count.users,
  createdAt: toIso(p.createdAt)!,
});

/** `staff` sees everything; the agency itself never gets Mashkoor's private notes or the reason it was suspended. */
const toDetail = (p: PartnerWithRefs, staff: boolean): PartnerDetail => ({
  ...toRow(p),
  state: p.state,
  gstNumber: p.gstNumber,
  panNumber: p.panNumber,
  kycDocuments: (p.kycDocuments as PartnerDetail["kycDocuments"]) ?? [],
  notes: p.notes,
  internalNotes: staff ? p.internalNotes : null,
  rejectedReason: staff ? p.rejectedReason : null,
  creditLimit: p.wallet?.creditLimit ?? 0,
  balance: p.wallet?.balance ?? 0,
  updatedAt: toIso(p.updatedAt)!,
});

/** M08 · Partners & KYC — the B2B agency directory: applications, approval, suspension, agency users. */
@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly wallet: WalletService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  private isStaff(actor: RequestUser) {
    return this.abilities.forUser(actor).can("manage", "Partner");
  }

  async list(actor: RequestUser, query: PartnerListQuery): Promise<Paginated<PartnerRow>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.PartnerWhereInput = {
      AND: [
        accessibleBy(ability).Partner,
        query.status ? { status: query.status } : {},
        query.q ? { OR: [{ companyName: { contains: query.q, mode: "insensitive" } }, { contactName: { contains: query.q, mode: "insensitive" } }, { refNo: { contains: query.q, mode: "insensitive" } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({ where, include, orderBy: { createdAt: "desc" }, ...paginate(query.page, query.pageSize) }),
      this.prisma.partner.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(actor: RequestUser, id: string): Promise<PartnerDetail> {
    await this.assertReadable(actor, id);
    return toDetail(await this.prisma.partner.findUniqueOrThrow({ where: { id }, include }), this.isStaff(actor));
  }

  /**
   * From the website's agent-application form, or entered directly by an admin. Starts PENDING either way.
   * Sending the same email again returns the existing application instead of creating a duplicate, and the managers
   * are told a new one is waiting.
   */
  async apply(input: PartnerApplicationInput): Promise<{ refNo: string }> {
    const existing = await this.prisma.partner.findFirst({ where: { email: input.email, status: { in: ["PENDING", "APPROVED"] } }, select: { refNo: true } });
    if (existing) return { refNo: existing.refNo };

    const created = await this.prisma.partner.create({ data: { ...input, refNo: await this.sequences.next("partner") } });
    await this.mail
      .sendToStaff(["OPS_MANAGER", "SUPER_ADMIN"], () => ({
        subject: `New partner application ${created.refNo} — ${created.companyName}`,
        text: `${created.companyName} (${created.contactName}, ${created.phone}) has applied to become a B2B partner.\n\nReview it here: ${this.config.get("APP_URL")}/admin/partners/${created.id}`,
        entityType: "Partner",
        entityId: created.id,
      }))
      .catch(() => undefined);
    return { refNo: created.refNo };
  }

  async update(actor: RequestUser, id: string, input: PartnerUpdateData): Promise<PartnerDetail> {
    await this.assertWritable(actor, id);
    const staff = this.isStaff(actor);
    const { creditLimit, internalNotes, ...rest } = input;
    const before = await this.prisma.partner.findUniqueOrThrow({ where: { id } });
    // An agency edits its own profile, but not Mashkoor's private notes about it.
    const after = await this.prisma.partner.update({ where: { id }, data: { ...rest, ...(staff && internalNotes !== undefined ? { internalNotes } : {}) }, include });
    if (creditLimit !== undefined) await this.wallet.setCreditLimit(actor, id, creditLimit);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "partner.updated", entityType: "Partner", entityId: id, before, after });
    return this.get(actor, id);
  }

  /** Approves a pending application: creates the wallet and, optionally, invites the first Partner Admin. */
  async approve(actor: RequestUser, id: string): Promise<PartnerDetail> {
    if (!this.abilities.forUser(actor).can("manage", "Partner")) throw AppError.forbidden();
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw AppError.notFound("Partner");
    if (partner.status === "APPROVED") return this.get(actor, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.partner.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.id, rejectedReason: null } });
      await this.wallet.ensureAccount(id, tx);
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "partner.approved", entityType: "Partner", entityId: id }, tx);
    });
    // Approving a previously suspended or rejected agency brings back the users that went down with it.
    await this.restoreUsers(id);
    await this.mail.send({
      ...emails.partnerApproved({ contactName: partner.contactName, companyName: partner.companyName, loginUrl: `${this.config.get("APP_URL")}/b2b` }),
      to: partner.email,
      toName: partner.contactName,
      dedupeKey: `partner-approved:${id}`,
      entityType: "Partner",
      entityId: id,
    });
    return this.get(actor, id);
  }

  async reject(actor: RequestUser, id: string, reason: string): Promise<PartnerDetail> {
    if (!this.abilities.forUser(actor).can("manage", "Partner")) throw AppError.forbidden();
    const partner = await this.prisma.partner.findUnique({ where: { id }, select: { status: true } });
    if (!partner) throw AppError.notFound("Partner");
    await this.prisma.partner.update({ where: { id }, data: { status: "REJECTED", rejectedReason: reason } });
    // Rejecting an agency that was already live must cut off its users, exactly like a suspension.
    if (partner.status === "APPROVED") await this.disableUsers(id);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "partner.rejected", entityType: "Partner", entityId: id, after: { reason } });
    return this.get(actor, id);
  }

  async suspend(actor: RequestUser, id: string, reason: string): Promise<PartnerDetail> {
    if (!this.abilities.forUser(actor).can("manage", "Partner")) throw AppError.forbidden();
    const partner = await this.prisma.partner.findUnique({ where: { id }, select: { status: true } });
    if (!partner) throw AppError.notFound("Partner");
    if (partner.status !== "APPROVED") throw AppError.conflict("Only an approved partner can be suspended");
    await this.prisma.partner.update({ where: { id }, data: { status: "SUSPENDED", rejectedReason: reason } });
    await this.disableUsers(id);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "partner.suspended", entityType: "Partner", entityId: id, after: { reason } });
    return this.get(actor, id);
  }

  async reinstate(actor: RequestUser, id: string): Promise<PartnerDetail> {
    if (!this.abilities.forUser(actor).can("manage", "Partner")) throw AppError.forbidden();
    const partner = await this.prisma.partner.findUnique({ where: { id }, select: { status: true } });
    if (!partner) throw AppError.notFound("Partner");
    if (partner.status !== "SUSPENDED") throw AppError.conflict("Only a suspended partner can be reinstated");
    await this.prisma.partner.update({ where: { id }, data: { status: "APPROVED", rejectedReason: null } });
    await this.restoreUsers(id);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "partner.reinstated", entityType: "Partner", entityId: id });
    return this.get(actor, id);
  }

  /** Invites the first Partner Admin for an approved partner — reuses the same invite-token flow as staff. */
  async inviteAdmin(actor: RequestUser, id: string, name: string, email: string) {
    if (!this.abilities.forUser(actor).can("manage", "Partner")) throw AppError.forbidden();
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw AppError.notFound("Partner");
    if (partner.status !== "APPROVED") throw AppError.conflict("Approve this partner before inviting an admin");
    if (await this.prisma.user.findUnique({ where: { email } })) throw AppError.conflict("Someone with this email already has an account");

    const user = await this.prisma.user.create({
      data: { type: "PARTNER", role: "PARTNER_ADMIN", name, email, partnerId: id, status: "INVITED", createdById: actor.id },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "partner.admin_invited", entityType: "Partner", entityId: id, after: { email } });
    await this.auth.sendInvite(user, actor.id);
    return { id: user.id, email: user.email };
  }

  /** Switches off every live user of the agency and ends their sessions, remembering they went down with the agency. */
  private async disableUsers(partnerId: string) {
    const users = await this.prisma.user.findMany({ where: { partnerId, type: "PARTNER", status: { not: "DISABLED" } }, select: { id: true } });
    if (users.length === 0) return;
    await this.prisma.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { status: "DISABLED", disabledReason: "PARTNER_SUSPENDED" } });
    await this.prisma.userToken.updateMany({ where: { userId: { in: users.map((u) => u.id) }, purpose: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
    for (const u of users) await this.tokens.revokeAllForUser(u.id);
  }

  /** Brings back only the users that were switched off with the agency; anyone an admin disabled by hand stays disabled. */
  private async restoreUsers(partnerId: string) {
    const where = { partnerId, type: "PARTNER" as const, disabledReason: "PARTNER_SUSPENDED" };
    await this.prisma.user.updateMany({ where: { ...where, passwordHash: { not: null } }, data: { status: "ACTIVE", disabledReason: null } });
    // Never accepted their invitation: back to "invited" (their old link was cancelled — resend it from the Team page).
    await this.prisma.user.updateMany({ where: { ...where, passwordHash: null }, data: { status: "INVITED", disabledReason: null } });
    this.tokens.invalidateAuthState();
  }

  private async assertReadable(actor: RequestUser, id: string) {
    const ability = this.abilities.forUser(actor);
    if (ability.can("manage", "Partner")) return;
    if (actor.portal === "b2b" && actor.partnerId === id) return;
    throw AppError.forbidden();
  }

  private async assertWritable(actor: RequestUser, id: string) {
    const ability = this.abilities.forUser(actor);
    if (ability.can("manage", "Partner")) return;
    // Partner Admins can edit their own profile, but not KYC review fields or credit limit.
    if (actor.portal === "b2b" && actor.role === "PARTNER_ADMIN" && actor.partnerId === id) return;
    throw AppError.forbidden();
  }
}
