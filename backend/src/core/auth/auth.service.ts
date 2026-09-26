import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ERROR_CODES,
  PORTAL_USER_TYPE,
  type AcceptInviteInput,
  type AuthSession,
  type LoginInput,
  type MeResponse,
  type OtpVerifyInput,
  type Portal,
  type ResetPasswordInput,
  type SessionUser,
} from "@mashkoor/shared";
import type { User, UserTokenPurpose } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AppConfig } from "../config/app-config.service";
import { AppError } from "../http/app-error";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { AbilityFactory } from "../rbac/ability.factory";
import { AuthStateService } from "./auth-state.service";
import { dummyPasswordHash, hashPassword, randomOtp, randomToken, verifyPassword } from "./crypto";
import type { RequestUser } from "./request-user";
import { TokenService, type ClientInfo } from "./token.service";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
/** At most this many codes per account in the window, and this many wrong guesses per account per hour. */
const OTP_MAX_REQUESTS = 3;
const OTP_REQUEST_WINDOW_MINUTES = 15;
const OTP_MAX_ATTEMPTS_PER_HOUR = 10;

const TOKEN_TTL_MINUTES: Record<UserTokenPurpose, number> = {
  INVITE: 48 * 60,
  PASSWORD_RESET: 30,
  LOGIN_OTP: OTP_TTL_MINUTES,
};

export const toSessionUser = (u: User): SessionUser => ({
  id: u.id,
  type: u.type,
  role: u.role,
  name: u.name,
  email: u.email,
  phone: u.phone,
  status: u.status,
  partnerId: u.partnerId,
  customerId: u.customerId,
});

export type IssuedSession = AuthSession & { refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly abilities: AbilityFactory,
    private readonly config: AppConfig,
    private readonly authState: AuthStateService,
  ) {}

  // ─── Password login (admin, b2b) ──────────────────────────────────────────

  async login(portal: "admin" | "b2b", input: LoginInput, client: ClientInfo): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const invalid = new AppError(HttpStatus.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS, "Incorrect email or password");

    if (!user || user.type !== PORTAL_USER_TYPE[portal]) {
      await verifyPassword(await dummyPasswordHash(), input.password);
      throw invalid;
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      // Only someone who knows the password learns the account is locked; everyone else sees the generic error,
      // so a lock can't be used to discover which emails have accounts.
      if (!(await verifyPassword(user.passwordHash, input.password))) throw invalid;
      throw new AppError(HttpStatus.UNAUTHORIZED, ERROR_CODES.ACCOUNT_LOCKED, `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes.`);
    }

    if (!(await verifyPassword(user.passwordHash, input.password))) {
      const failed = user.failedLogins + 1;
      const locked = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: locked ? 0 : failed, lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      await this.audit.record({ actorId: user.id, portal, action: locked ? "auth.locked" : "auth.login_failed", entityType: "User", entityId: user.id });
      throw invalid;
    }

    if (user.status === "DISABLED") throw new AppError(HttpStatus.UNAUTHORIZED, ERROR_CODES.ACCOUNT_DISABLED, "This account has been disabled");
    if (user.status === "INVITED") throw new AppError(HttpStatus.UNAUTHORIZED, ERROR_CODES.ACCOUNT_DISABLED, "Please accept your invitation email first");
    // A partner user whose agency is suspended or rejected can't sign in even if their own account is switched on.
    this.authState.invalidate(user.id);
    if (!(await this.authState.get(user.id)).active) throw new AppError(HttpStatus.UNAUTHORIZED, ERROR_CODES.ACCOUNT_DISABLED, "This account has been disabled");

    return this.startSession(user, portal, client);
  }

  // ─── Email one-time code login (b2c) ──────────────────────────────────────

  /** Always resolves the same way whether or not the email exists, so accounts can't be discovered. */
  async requestOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.type !== "CUSTOMER" || user.status === "DISABLED") return;

    // A per-account budget on top of the per-IP limit: re-requesting codes must not hand an attacker fresh guesses,
    // or let anyone flood a customer's inbox.
    const recent = await this.prisma.userToken.count({ where: { userId: user.id, purpose: "LOGIN_OTP", createdAt: { gt: new Date(Date.now() - OTP_REQUEST_WINDOW_MINUTES * 60_000) } } });
    if (recent >= OTP_MAX_REQUESTS) return;

    await this.prisma.userToken.updateMany({ where: { userId: user.id, purpose: "LOGIN_OTP", usedAt: null }, data: { usedAt: new Date() } });
    const code = randomOtp();
    await this.createUserToken(user.id, "LOGIN_OTP", code);
    await this.mail.send({
      to: user.email,
      subject: `${code} is your Mashkoor sign-in code`,
      text: `Your Mashkoor sign-in code is ${code}.\n\nIt expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.`,
    });
  }

  async verifyOtp(input: OtpVerifyInput, client: ClientInfo): Promise<IssuedSession> {
    const invalid = new AppError(HttpStatus.UNAUTHORIZED, ERROR_CODES.TOKEN_INVALID, "The code is incorrect or has expired");
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.type !== "CUSTOMER" || user.status === "DISABLED") throw invalid;

    const token = await this.prisma.userToken.findFirst({
      where: { userId: user.id, purpose: "LOGIN_OTP", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!token || token.attempts >= OTP_MAX_ATTEMPTS) throw invalid;
    // Wrong guesses are counted across every code issued in the last hour, not per code.
    const wrongThisHour = await this.prisma.userToken.aggregate({ _sum: { attempts: true }, where: { userId: user.id, purpose: "LOGIN_OTP", createdAt: { gt: new Date(Date.now() - 3600_000) } } });
    if ((wrongThisHour._sum.attempts ?? 0) >= OTP_MAX_ATTEMPTS_PER_HOUR) throw invalid;

    if (token.tokenHash !== this.tokens.hash(input.code)) {
      await this.prisma.userToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }

    await this.prisma.userToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    const active = user.status === "ACTIVE" ? user : await this.prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
    return this.startSession(active, "b2c", client);
  }

  // ─── Session lifecycle ────────────────────────────────────────────────────

  async refresh(portal: Portal, refreshToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
    if (!refreshToken) throw AppError.unauthenticated();
    const rotated = await this.tokens.rotate(refreshToken, portal, client);
    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: this.tokens.accessTtlSeconds,
      user: toSessionUser(rotated.user),
    };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.tokens.revoke(refreshToken);
  }

  async me(requestUser: RequestUser): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: requestUser.id } });
    if (!user || user.status !== "ACTIVE") throw AppError.unauthenticated();
    return { user: toSessionUser(user), portal: requestUser.portal, rules: this.abilities.rulesFor(requestUser) };
  }

  // ─── Invites & password reset ─────────────────────────────────────────────

  /** Creates an invite for a user and emails the link. Used by the Users module. */
  async sendInvite(user: User, invitedBy?: string) {
    await this.prisma.userToken.updateMany({ where: { userId: user.id, purpose: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
    const token = randomToken(32);
    await this.createUserToken(user.id, "INVITE", token);
    const portal = user.type === "PARTNER" ? "b2b" : "admin";
    const link = `${this.config.get("APP_URL")}/${portal}/accept-invite?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: "You're invited to the Mashkoor platform",
      text: `Assalamu Alaikum ${user.name},\n\nYou have been invited to the Mashkoor platform. Set your password using the link below (valid for 48 hours):\n\n${link}`,
    });
    await this.audit.record({ actorId: invitedBy, action: "user.invited", entityType: "User", entityId: user.id });
  }

  async acceptInvite(input: AcceptInviteInput) {
    const token = await this.consumeUserToken("INVITE", input.token);
    const invitee = await this.prisma.user.findUnique({ where: { id: token.userId } });
    // An invite must never bring back an account an administrator has switched off.
    if (!invitee || invitee.status === "DISABLED") throw new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.TOKEN_INVALID, "This link is invalid or has expired");
    const user = await this.prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: await hashPassword(input.password), status: "ACTIVE", failedLogins: 0, lockedUntil: null },
    });
    await this.audit.record({ actorId: user.id, action: "user.invite_accepted", entityType: "User", entityId: user.id });
    return { portal: user.type === "PARTNER" ? "b2b" : "admin" };
  }

  async forgotPassword(portal: "admin" | "b2b", email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.type !== PORTAL_USER_TYPE[portal] || user.status !== "ACTIVE") return;

    await this.prisma.userToken.updateMany({ where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null }, data: { usedAt: new Date() } });
    const token = randomToken(32);
    await this.createUserToken(user.id, "PASSWORD_RESET", token);
    await this.mail.send({
      to: user.email,
      subject: "Reset your Mashkoor password",
      text: `Use this link to set a new password (valid for 30 minutes):\n\n${this.config.get("APP_URL")}/${portal}/reset-password?token=${token}\n\nIf you didn't request this, you can ignore this email.`,
    });
  }

  async resetPassword(input: ResetPasswordInput) {
    const token = await this.consumeUserToken("PASSWORD_RESET", input.token);
    const user = await this.prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: await hashPassword(input.password), failedLogins: 0, lockedUntil: null },
    });
    await this.tokens.revokeAllForUser(user.id);
    await this.audit.record({ actorId: user.id, action: "user.password_reset", entityType: "User", entityId: user.id });
    return { portal: user.type === "PARTNER" ? "b2b" : "admin" };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async startSession(user: User, portal: Portal, client: ClientInfo): Promise<IssuedSession> {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } });
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccessToken(user, portal),
      this.tokens.issueRefreshToken(user.id, portal, client),
    ]);
    await this.audit.record({ actorId: user.id, portal, action: "auth.login", entityType: "User", entityId: user.id });
    return { accessToken, refreshToken, expiresIn: this.tokens.accessTtlSeconds, user: toSessionUser(user) };
  }

  private createUserToken(userId: string, purpose: UserTokenPurpose, secret: string) {
    return this.prisma.userToken.create({
      data: {
        userId,
        purpose,
        tokenHash: this.tokens.hash(secret),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES[purpose] * 60_000),
      },
    });
  }

  private async consumeUserToken(purpose: UserTokenPurpose, secret: string) {
    const token = await this.prisma.userToken.findFirst({
      where: { purpose, tokenHash: this.tokens.hash(secret), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!token) throw new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.TOKEN_INVALID, "This link is invalid or has expired");
    const { count } = await this.prisma.userToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
    if (count === 0) throw new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.TOKEN_INVALID, "This link has already been used");
    return token;
  }
}
