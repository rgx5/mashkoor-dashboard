import { Injectable, Logger } from "@nestjs/common";
import { subject } from "@casl/ability";
import type { PortalAccessInfo } from "@mashkoor/shared";
import { toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { TokenService } from "../../../core/auth/token.service";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

export type EnsureResult = "CREATED" | "EXISTS" | "DISABLED" | "NO_EMAIL" | "EMAIL_IN_USE";

/**
 * Gives a customer a login for the /b2c portal. Customers sign in with an emailed code, so an "account" is just a user
 * row tied to their customer record and email — there is no password to set or forget. Accounts are created the first
 * time we have something to show them (a shared plan, a booking, an update), so staff never have to remember to.
 */
@Injectable()
export class CustomerAccountsService {
  private readonly logger = new Logger(CustomerAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly tokens: TokenService,
  ) {}

  /** Creates the login if it doesn't exist and welcomes them once. Never throws: this must not break the action that triggered it. */
  async ensureAccount(customerId: string, options: { welcome?: boolean } = {}): Promise<EnsureResult> {
    try {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer || customer.deletedAt) return "NO_EMAIL";
      const email = customer.email?.trim().toLowerCase();
      if (!email) return "NO_EMAIL";

      const existing = await this.prisma.user.findFirst({ where: { customerId, type: "CUSTOMER" } });
      if (existing) return existing.status === "DISABLED" ? "DISABLED" : "EXISTS";

      // The email may already belong to a staff member or an agency user; never attach a customer login to their account.
      if (await this.prisma.user.findUnique({ where: { email } })) return "EMAIL_IN_USE";

      await this.prisma.user.create({ data: { type: "CUSTOMER", role: "CUSTOMER", name: customer.fullName, email, customerId, status: "ACTIVE" } });
      await this.audit.record({ action: "customer.portal_access_created", entityType: "Customer", entityId: customerId, after: { email } });
      if (options.welcome !== false) await this.sendWelcome(customer.fullName, email, customerId, `customer-welcome:${customerId}`);
      return "CREATED";
    } catch (error) {
      this.logger.warn(`Could not create a portal login for customer ${customerId}: ${error instanceof Error ? error.message : error}`);
      return "NO_EMAIL";
    }
  }

  /** Refuses an email address that already belongs to a different login (staff, agency or another customer). */
  async assertEmailAvailable(customerId: string, email: string) {
    const owner = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { customerId: true, type: true } });
    if (owner && !(owner.type === "CUSTOMER" && owner.customerId === customerId)) {
      throw AppError.conflict("This email address already belongs to another account");
    }
  }

  /**
   * Keeps the portal login in step with the customer's email. Codes are emailed to the *login's* address, so if the
   * customer record changes and the login doesn't, the new address never receives a code while the old mailbox keeps
   * access. Changing the address signs the customer out everywhere; removing it switches portal access off.
   */
  async syncEmail(customerId: string, email: string | null) {
    const users = await this.prisma.user.findMany({ where: { customerId, type: "CUSTOMER" }, orderBy: { createdAt: "asc" } });
    if (users.length === 0) return;
    const primary = users[0]!;
    if (email) {
      const next = email.trim().toLowerCase();
      if (primary.email === next) return;
      await this.assertEmailAvailable(customerId, next);
      await this.prisma.user.update({ where: { id: primary.id }, data: { email: next } });
      await this.prisma.userToken.updateMany({ where: { userId: primary.id, usedAt: null }, data: { usedAt: new Date() } });
      await this.tokens.revokeAllForUser(primary.id);
      await this.audit.record({ action: "customer.portal_email_changed", entityType: "Customer", entityId: customerId, before: { email: primary.email }, after: { email: next } });
    } else {
      await this.disableForCustomer(customerId);
    }
  }

  /** Switches off portal access (customer removed, or their email address was cleared). */
  async disableForCustomer(customerId: string) {
    const users = await this.prisma.user.findMany({ where: { customerId, type: "CUSTOMER", status: { not: "DISABLED" } }, select: { id: true } });
    for (const user of users) {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED", disabledReason: "MANUAL" } });
      await this.prisma.userToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await this.tokens.revokeAllForUser(user.id);
    }
  }

  private async sendWelcome(name: string, email: string, customerId: string, dedupeKey?: string) {
    await this.mail.send({
      ...emails.customerWelcome({ customerName: name, email, loginUrl: `${this.config.get("APP_URL")}/b2c/login` }),
      to: email,
      toName: name,
      dedupeKey,
      entityType: "Customer",
      entityId: customerId,
    });
  }

  // ─── Staff-facing ─────────────────────────────────────────────────────────

  async info(actor: RequestUser, customerId: string): Promise<PortalAccessInfo> {
    const customer = await this.findAccessible(actor, customerId, "read");
    const user = await this.prisma.user.findFirst({ where: { customerId, type: "CUSTOMER" } });
    return {
      hasEmail: Boolean(customer.email),
      email: customer.email,
      status: !user ? "NONE" : user.status === "DISABLED" ? "DISABLED" : "ACTIVE",
      lastLoginAt: toIso(user?.lastLoginAt ?? null),
    };
  }

  /** "Invite to portal": creates the login if needed and (re)sends the welcome email. */
  async invite(actor: RequestUser, customerId: string): Promise<PortalAccessInfo & { emailed: boolean }> {
    const customer = await this.findAccessible(actor, customerId, "update");
    if (!customer.email) throw AppError.conflict("Add an email address to this customer first");
    const result = await this.ensureAccount(customerId, { welcome: false });
    if (result === "EMAIL_IN_USE") throw AppError.conflict("This email address already belongs to a staff or agency account");
    if (result === "DISABLED") throw AppError.conflict("This customer's portal access is switched off");
    await this.sendWelcome(customer.fullName, customer.email.toLowerCase(), customerId);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "customer.portal_invited", entityType: "Customer", entityId: customerId });
    return { ...(await this.info(actor, customerId)), emailed: true };
  }

  private async findAccessible(actor: RequestUser, id: string, action: "read" | "update") {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer || customer.deletedAt) throw AppError.notFound("Customer");
    if (!this.abilities.forUser(actor).can(action, subject("Customer", customer))) throw AppError.forbidden();
    return customer;
  }
}
