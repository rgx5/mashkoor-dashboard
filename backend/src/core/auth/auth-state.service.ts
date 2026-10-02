import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface AuthState {
  active: boolean;
  role: string;
  partnerId: string | null;
  customerId: string | null;
  features: string[];
}

const TTL_MS = 10_000;
const MAX_ENTRIES = 2_000;

/**
 * What the database says about a signed-in user right now. Access tokens are stateless JWTs valid for 15 minutes, so
 * without this a disabled user, a suspended agency or a demoted role would keep working until the token expired.
 * The answer is cached for a few seconds (one small query per user per 10 s) and dropped immediately whenever an
 * account, role or partner status changes (`invalidate`), so changes apply at once on this server.
 */
@Injectable()
export class AuthStateService {
  private readonly cache = new Map<string, { at: number; state: AuthState }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<AuthState> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.state;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, role: true, partnerId: true, customerId: true, featureAccess: true, type: true, partner: { select: { status: true } } },
    });
    const partnerBlocked = user?.type === "PARTNER" && user.partner?.status !== "APPROVED";
    // A customer whose record was deleted (or merged away) must not keep a portal session on a dead record.
    let customerBlocked = false;
    if (user?.type === "CUSTOMER") {
      const customer = user.customerId ? await this.prisma.customer.findUnique({ where: { id: user.customerId }, select: { deletedAt: true } }) : null;
      customerBlocked = !customer || customer.deletedAt !== null;
    }
    const state: AuthState = {
      active: Boolean(user) && user!.status === "ACTIVE" && !partnerBlocked && !customerBlocked,
      role: user?.role ?? "",
      partnerId: user?.partnerId ?? null,
      customerId: user?.customerId ?? null,
      features: user?.featureAccess ?? [],
    };
    if (this.cache.size >= MAX_ENTRIES) this.cache.clear();
    this.cache.set(userId, { at: Date.now(), state });
    return state;
  }

  /** Forget one user (or everyone, after a partner-wide change) so the next request re-reads the database. */
  invalidate(userId?: string) {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }
}
