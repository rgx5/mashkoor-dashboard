import { Injectable } from "@nestjs/common";
import { BASE_CURRENCY, type CurrencyData, type CurrencyRow, type CurrencyUpdateData } from "@mashkoor/shared";
import type { Currency } from "@prisma/client";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toRow = (c: Currency): CurrencyRow => ({ code: c.code, name: c.name, symbol: c.symbol, rateToInr: c.rateToInr, active: c.active, updatedAt: c.updatedAt.toISOString() });

/**
 * Currencies a quotation line can be priced in (a Saudi hotel billed in SAR, for example). INR is the fixed base:
 * always present, rate 1, and can't be deleted. Rates here are only ever a starting point for a NEW line —
 * itineraries.ts snapshots the rate onto the line when it's priced, so changing a rate here never moves an
 * existing quotation's total underneath it.
 */
@Injectable()
export class CurrenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser): Promise<CurrencyRow[]> {
    if (!this.abilities.forUser(actor).can("read", "Currency")) throw AppError.forbidden();
    const rows = await this.prisma.currency.findMany({ orderBy: [{ code: "asc" }] });
    return rows.map(toRow);
  }

  async create(actor: RequestUser, input: CurrencyData): Promise<CurrencyRow> {
    if (!this.abilities.forUser(actor).can("manage", "Currency")) throw AppError.forbidden();
    if (input.code === BASE_CURRENCY) throw AppError.conflict(`${BASE_CURRENCY} already exists and is always rate 1`);
    if (await this.prisma.currency.findUnique({ where: { code: input.code } })) throw AppError.conflict(`${input.code} already exists`);

    const created = await this.prisma.currency.create({ data: { ...input, updatedById: actor.id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "currency.created", entityType: "Currency", entityId: created.code, after: created });
    return toRow(created);
  }

  async update(actor: RequestUser, code: string, input: CurrencyUpdateData): Promise<CurrencyRow> {
    if (!this.abilities.forUser(actor).can("manage", "Currency")) throw AppError.forbidden();
    const before = await this.prisma.currency.findUnique({ where: { code } });
    if (!before) throw AppError.notFound("Currency");
    // INR anchors every conversion — letting it drift from 1 would silently rescale every other currency's meaning.
    if (code === BASE_CURRENCY && input.rateToInr !== undefined && input.rateToInr !== 1) throw AppError.conflict(`${BASE_CURRENCY} must stay rate 1`);

    const after = await this.prisma.currency.update({ where: { code }, data: { ...input, updatedById: actor.id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "currency.updated", entityType: "Currency", entityId: code, before, after });
    return toRow(after);
  }

  async remove(actor: RequestUser, code: string) {
    if (!this.abilities.forUser(actor).can("manage", "Currency")) throw AppError.forbidden();
    if (code === BASE_CURRENCY) throw AppError.conflict(`${BASE_CURRENCY} can't be deleted`);
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) throw AppError.notFound("Currency");
    await this.prisma.currency.delete({ where: { code } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "currency.deleted", entityType: "Currency", entityId: code, before: currency });
  }
}
