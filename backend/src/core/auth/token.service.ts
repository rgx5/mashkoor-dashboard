import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AccessTokenClaims, Portal } from "@mashkoor/shared";
import type { User } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppConfig } from "../config/app-config.service";
import { AppError } from "../http/app-error";
import { PrismaService } from "../prisma/prisma.service";
import { AuthStateService } from "./auth-state.service";
import { hashIp, hashToken, randomToken } from "./crypto";

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly authState: AuthStateService,
  ) {}

  get accessTtlSeconds() {
    return this.config.get("JWT_ACCESS_TTL_SECONDS");
  }

  get refreshTtlMs() {
    return this.config.get("REFRESH_TOKEN_TTL_DAYS") * 24 * 60 * 60 * 1000;
  }

  hash(token: string) {
    return hashToken(token, this.config.get("TOKEN_PEPPER"));
  }

  signAccessToken(user: Pick<User, "id" | "role" | "partnerId" | "customerId">, portal: Portal) {
    const claims: Omit<AccessTokenClaims, "aud" | "sub"> = {
      role: user.role,
      partnerId: user.partnerId,
      customerId: user.customerId,
    };
    return this.jwt.signAsync(claims, {
      secret: this.config.get("JWT_ACCESS_SECRET"),
      subject: user.id,
      audience: portal,
      expiresIn: this.accessTtlSeconds,
      algorithm: "HS256",
    });
  }

  /** Issues a new refresh token. Pass `familyId` when rotating so reuse can be detected across the chain. */
  async issueRefreshToken(userId: string, portal: Portal, client: ClientInfo, familyId: string = randomUUID()) {
    const token = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        portal,
        familyId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        userAgent: client.userAgent?.slice(0, 300),
        ipHash: hashIp(client.ip, this.config.get("TOKEN_PEPPER")),
      },
    });
    return token;
  }

  /**
   * Rotates a refresh token. If a token that was already rotated is presented again, the whole
   * family is revoked — someone is replaying a stolen token.
   */
  async rotate(presented: string, portal: Portal, client: ClientInfo) {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(presented) }, include: { user: true } });

    if (!record || record.portal !== portal) throw AppError.unauthenticated();

    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      throw AppError.unauthenticated("Your session was ended for security reasons. Please sign in again.");
    }
    if (record.expiresAt < new Date() || record.user.status !== "ACTIVE" || !(await this.authState.get(record.userId)).active) {
      await this.revokeFamily(record.familyId);
      throw AppError.unauthenticated();
    }

    // Conditional update guards against two tabs refreshing at the same moment.
    const { count } = await this.prisma.refreshToken.updateMany({ where: { id: record.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (count === 0) {
      await this.revokeFamily(record.familyId);
      throw AppError.unauthenticated();
    }

    const refreshToken = await this.issueRefreshToken(record.userId, portal, client, record.familyId);
    const accessToken = await this.signAccessToken(record.user, portal);
    return { user: record.user, accessToken, refreshToken };
  }

  async revoke(presented: string) {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: this.hash(presented), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Makes the API re-read every account on its next request (after a partner-wide change). */
  invalidateAuthState() {
    this.authState.invalidate();
  }

  /** Ends every session of a user and makes the API re-check their account on the very next request. */
  async revokeAllForUser(userId: string) {
    const result = await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.authState.invalidate(userId);
    return result;
  }
}
