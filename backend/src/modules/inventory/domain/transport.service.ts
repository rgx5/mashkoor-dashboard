import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import type { Paginated, TransportListQuery, TransportOptionData, TransportOptionRow, TransportOptionUpdateData } from "@mashkoor/shared";
import type { Prisma, TransportOption } from "@prisma/client";
import { paginate } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toRow = (t: TransportOption): TransportOptionRow => ({
  id: t.id,
  vehicleType: t.vehicleType,
  fromPlace: t.fromPlace,
  toPlace: t.toPlace,
  seats: t.seats,
  costPrice: t.costPrice,
  currency: t.currency,
  foreignAmount: t.foreignAmount,
  fxRate: t.fxRate,
  active: t.active,
  notes: t.notes,
});

/** Supplier cost is for managers only; everyone else gets `null` so it can't leak through this API. */
export const redactTransportCost = (row: TransportOptionRow, canSeeCost: boolean): TransportOptionRow => (canSeeCost ? row : { ...row, costPrice: null, foreignAmount: null, fxRate: null });

/**
 * M05 · Inventory — transport: the vehicles and routes Mashkoor can quote, each with a price per vehicle. A price list rather
 * than a stock count, so there is nothing to reserve; picking one in a quotation fills in the line and its price.
 */
@Injectable()
export class TransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, query: TransportListQuery): Promise<Paginated<TransportOptionRow>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.TransportOptionWhereInput = {
      AND: [
        accessibleBy(ability).TransportOption,
        query.active === undefined ? {} : { active: query.active },
        query.q
          ? {
              OR: [
                { vehicleType: { contains: query.q, mode: "insensitive" } },
                { fromPlace: { contains: query.q, mode: "insensitive" } },
                { toPlace: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transportOption.findMany({ where, orderBy: [{ fromPlace: "asc" }, { toPlace: "asc" }, { vehicleType: "asc" }], ...paginate(query.page, query.pageSize) }),
      this.prisma.transportOption.count({ where }),
    ]);
    const showCost = ability.can("manage", "TransportOption");
    return { data: rows.map((r) => redactTransportCost(toRow(r), showCost)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Active options for a quotation, matched loosely on the route and the vehicle. */
  search(filters: { fromPlace?: string; toPlace?: string; q?: string }) {
    return this.prisma.transportOption.findMany({
      where: {
        active: true,
        ...(filters.fromPlace ? { fromPlace: { contains: filters.fromPlace, mode: "insensitive" } } : {}),
        ...(filters.toPlace ? { toPlace: { contains: filters.toPlace, mode: "insensitive" } } : {}),
        ...(filters.q ? { vehicleType: { contains: filters.q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ fromPlace: "asc" }, { toPlace: "asc" }, { seats: "asc" }],
      take: 100,
    });
  }

  async create(actor: RequestUser, input: TransportOptionData): Promise<TransportOptionRow> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("create", "TransportOption")) throw AppError.forbidden();
    const cost = await this.priced(input);
    const created = await this.prisma.transportOption.create({
      data: { vehicleType: input.vehicleType, fromPlace: input.fromPlace, toPlace: input.toPlace, seats: input.seats, active: input.active, notes: input.notes, ...cost },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "transportOption.created", entityType: "TransportOption", entityId: created.id, after: created });
    return toRow(created);
  }

  async update(actor: RequestUser, id: string, input: TransportOptionUpdateData): Promise<TransportOptionRow> {
    const before = await this.findAccessible(actor, id, "update");
    const touchesCost = input.costPrice !== undefined || input.currency !== undefined || input.foreignAmount !== undefined || input.fxRate !== undefined;
    const cost = touchesCost
      ? await this.priced({
          costPrice: input.costPrice ?? before.costPrice,
          currency: input.currency ?? before.currency,
          foreignAmount: input.foreignAmount !== undefined ? input.foreignAmount : before.foreignAmount,
          fxRate: input.fxRate !== undefined ? input.fxRate : before.fxRate,
        })
      : {};
    const { costPrice: _c, currency: _cur, foreignAmount: _f, fxRate: _x, ...rest } = input;
    const after = await this.prisma.transportOption.update({ where: { id }, data: { ...rest, ...cost } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "transportOption.updated", entityType: "TransportOption", entityId: id, before, after });
    return toRow(after);
  }

  async remove(actor: RequestUser, id: string) {
    const before = await this.findAccessible(actor, id, "delete");
    await this.prisma.transportOption.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "transportOption.deleted", entityType: "TransportOption", entityId: id, before });
  }

  /**
   * The rupee cost and currency details to store. A price quoted in another currency is converted here from the amount and
   * the rate typed with it, so the rupee figure everything else uses can never disagree with them.
   */
  private async priced(input: { costPrice: number; currency?: string; foreignAmount?: number | null; fxRate?: number | null }) {
    const currency = input.currency ?? "INR";
    if (currency === "INR") return { costPrice: input.costPrice, currency: "INR", foreignAmount: null, fxRate: null };
    if (input.foreignAmount == null || !input.fxRate) throw AppError.conflict("Enter the price in this currency");
    const known = await this.prisma.currency.findUnique({ where: { code: currency }, select: { active: true } });
    if (!known?.active) throw AppError.conflict(`${currency} isn't a currency you've set up`);
    return { costPrice: Math.round(input.foreignAmount * input.fxRate), currency, foreignAmount: input.foreignAmount, fxRate: input.fxRate };
  }

  private async findAccessible(actor: RequestUser, id: string, action: "update" | "delete") {
    const option = await this.prisma.transportOption.findUnique({ where: { id } });
    if (!option) throw AppError.notFound("Transport option");
    if (!this.abilities.forUser(actor).can(action, subject("TransportOption", option))) throw AppError.forbidden();
    return option;
  }
}
