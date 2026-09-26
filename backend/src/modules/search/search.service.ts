import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import { normalizePhone, type SearchResults } from "@mashkoor/shared";
import type { RequestUser } from "../../core/auth/request-user";
import { PrismaService } from "../../core/prisma/prisma.service";
import { AbilityFactory } from "../../core/rbac/ability.factory";

const LIMIT = 5;

/** Quick-find used by the Admin header: name, mobile, email or reference number → customers, leads and bookings the caller may see. */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
  ) {}

  async search(actor: RequestUser, q: string): Promise<SearchResults> {
    if (q.length < 2) return { customers: [], leads: [], bookings: [] };

    const ability = this.abilities.forUser(actor);
    // A typed number matches however it's formatted; short digit runs still match as a fragment.
    const digits = q.replace(/\D/g, "");
    const phone = normalizePhone(q) ?? (digits.length >= 4 ? digits : null);
    const like = (field: string) => ({ [field]: { contains: q, mode: "insensitive" as const } });

    const [customers, leads, bookings] = await Promise.all([
      ability.can("read", "Customer")
        ? this.prisma.customer.findMany({
            where: { AND: [accessibleBy(ability).Customer, { deletedAt: null }, { OR: [like("fullName"), like("refNo"), like("email"), ...(phone ? [{ phone: { contains: phone } }] : [])] }] },
            select: { id: true, refNo: true, fullName: true, phone: true },
            orderBy: { updatedAt: "desc" },
            take: LIMIT,
          })
        : [],
      ability.can("read", "Lead")
        ? this.prisma.lead.findMany({
            where: { AND: [accessibleBy(ability).Lead, { OR: [like("contactName"), like("refNo"), like("email"), ...(phone ? [{ phone: { contains: phone } }] : [])] }] },
            select: { id: true, refNo: true, contactName: true, phone: true, stage: true },
            orderBy: { updatedAt: "desc" },
            take: LIMIT,
          })
        : [],
      ability.can("read", "Booking")
        ? this.prisma.booking.findMany({
            where: {
              AND: [
                accessibleBy(ability).Booking,
                { OR: [like("refNo"), { customer: { fullName: { contains: q, mode: "insensitive" } } }, ...(phone ? [{ customer: { phone: { contains: phone } } }] : [])] },
              ],
            },
            select: { id: true, refNo: true, status: true, customer: { select: { fullName: true } } },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
          })
        : [],
    ]);

    return { customers, leads, bookings: bookings.map((b) => ({ id: b.id, refNo: b.refNo, status: b.status, customerName: b.customer.fullName })) };
  }
}
