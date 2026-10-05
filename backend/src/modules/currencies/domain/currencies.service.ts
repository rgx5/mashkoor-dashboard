import { Injectable } from "@nestjs/common";
import { BASE_CURRENCY, type CurrencyData, type CurrencyRateLogRow, type CurrencyRatesUpdateData, type CurrencyRow, type CurrencyUpdateData } from "@mashkoor/shared";
import type { Currency, Prisma } from "@prisma/client";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toRow = (c: Currency, previousRate: number | null, updatedBy: string | null): CurrencyRow => ({
  code: c.code,
  name: c.name,
  symbol: c.symbol,
  rateToInr: c.rateToInr,
  previousRate,
  active: c.active,
  updatedAt: c.updatedAt.toISOString(),
  updatedBy,
});

/**
 * Currencies a quotation line can be priced in (a Saudi hotel billed in SAR, for example) and the forex page's rates. INR is
 * the fixed base: always present, rate 1, and can't be deleted. Rates here are only ever a starting point for a NEW line —
 * itineraries.ts snapshots the rate onto the line when it's priced, so changing a rate here never moves an existing
 * quotation's total underneath it. Every rate a currency has had is kept in `CurrencyRateLog`, so the page can show how it moved.
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
    const [rows, latest] = await Promise.all([
      this.prisma.currency.findMany({ orderBy: [{ code: "asc" }] }),
      // The most recent log entry of each currency: what it was before, and who changed it.
      this.prisma.currencyRateLog.findMany({ distinct: ["code"], orderBy: [{ code: "asc" }, { createdAt: "desc" }] }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set([...latest.map((l) => l.changedById), ...rows.map((r) => r.updatedById)].filter((id): id is string => Boolean(id)))] } }, select: { id: true, name: true } });
    const names = new Map(users.map((u) => [u.id, u.name]));
    const logByCode = new Map(latest.map((l) => [l.code, l]));
    return rows.map((c) => {
      const log = logByCode.get(c.code);
      return toRow(c, log?.previousRate ?? null, names.get(log?.changedById ?? c.updatedById ?? "") ?? null);
    });
  }

  async history(actor: RequestUser, code: string, limit = 60): Promise<CurrencyRateLogRow[]> {
    if (!this.abilities.forUser(actor).can("read", "Currency")) throw AppError.forbidden();
    const logs = await this.prisma.currencyRateLog.findMany({ where: { code }, orderBy: { createdAt: "desc" }, take: limit });
    const users = await this.prisma.user.findMany({ where: { id: { in: logs.map((l) => l.changedById).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true } });
    const names = new Map(users.map((u) => [u.id, u.name]));
    // Oldest first, so a chart can plot it as it comes.
    return logs
      .reverse()
      .map((l) => ({ id: l.id, rate: l.rate, previousRate: l.previousRate, changedBy: names.get(l.changedById ?? "") ?? null, createdAt: l.createdAt.toISOString() }));
  }

  async create(actor: RequestUser, input: CurrencyData): Promise<CurrencyRow> {
    if (!this.abilities.forUser(actor).can("manage", "Currency")) throw AppError.forbidden();
    if (input.code === BASE_CURRENCY) throw AppError.conflict(`${BASE_CURRENCY} already exists and is always rate 1`);
    if (await this.prisma.currency.findUnique({ where: { code: input.code } })) throw AppError.conflict(`${input.code} already exists`);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.currency.create({ data: { ...input, updatedById: actor.id } });
      await tx.currencyRateLog.create({ data: { code: row.code, rate: row.rateToInr, previousRate: null, changedById: actor.id } });
      return row;
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "currency.created", entityType: "Currency", entityId: created.code, after: created });
    return toRow(created, null, actor.id ? await this.nameOf(actor.id) : null);
  }

  async update(actor: RequestUser, code: string, input: CurrencyUpdateData): Promise<CurrencyRow> {
    if (!this.abilities.forUser(actor).can("manage", "Currency")) throw AppError.forbidden();
    const before = await this.prisma.currency.findUnique({ where: { code } });
    if (!before) throw AppError.notFound("Currency");
    // INR anchors every conversion — letting it drift from 1 would silently rescale every other currency's meaning.
    if (code === BASE_CURRENCY && input.rateToInr !== undefined && input.rateToInr !== 1) throw AppError.conflict(`${BASE_CURRENCY} must stay rate 1`);

    const after = await this.prisma.$transaction(async (tx) => {
      const row = await tx.currency.update({ where: { code }, data: { ...input, updatedById: actor.id } });
      if (input.rateToInr !== undefined && input.rateToInr !== before.rateToInr) await tx.currencyRateLog.create({ data: { code, rate: row.rateToInr, previousRate: before.rateToInr, changedById: actor.id } });
      return row;
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "currency.updated", entityType: "Currency", entityId: code, before, after });
    return toRow(after, input.rateToInr !== undefined && input.rateToInr !== before.rateToInr ? before.rateToInr : null, await this.nameOf(actor.id));
  }

  /** Today's rates for several currencies in one go. Rates that haven't changed are left alone, so the history stays meaningful. */
  async updateRates(actor: RequestUser, input: CurrencyRatesUpdateData): Promise<{ changed: number }> {
    if (!this.abilities.forUser(actor).can("manage", "Currency")) throw AppError.forbidden();
    const wanted = new Map(input.rates.map((r) => [r.code, r.rateToInr]));
    if (wanted.has(BASE_CURRENCY) && wanted.get(BASE_CURRENCY) !== 1) throw AppError.conflict(`${BASE_CURRENCY} must stay rate 1`);
    wanted.delete(BASE_CURRENCY);

    const current = await this.prisma.currency.findMany({ where: { code: { in: [...wanted.keys()] } } });
    if (current.length !== wanted.size) throw AppError.notFound("Currency");
    const changes = current.filter((c) => wanted.get(c.code) !== c.rateToInr);

    await this.prisma.$transaction(
      changes.flatMap((c): Prisma.PrismaPromise<unknown>[] => [
        this.prisma.currency.update({ where: { code: c.code }, data: { rateToInr: wanted.get(c.code)!, updatedById: actor.id } }),
        this.prisma.currencyRateLog.create({ data: { code: c.code, rate: wanted.get(c.code)!, previousRate: c.rateToInr, changedById: actor.id } }),
      ]),
    );
    if (changes.length > 0) {
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "currency.rates_updated", entityType: "Currency", after: Object.fromEntries(changes.map((c) => [c.code, { from: c.rateToInr, to: wanted.get(c.code) }])) });
    }
    return { changed: changes.length };
  }

  async remove(actor: RequestUser, code: string) {
    if (!this.abilities.forUser(actor).can("manage", "Currency")) throw AppError.forbidden();
    if (code === BASE_CURRENCY) throw AppError.conflict(`${BASE_CURRENCY} can't be deleted`);
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) throw AppError.notFound("Currency");
    await this.prisma.currency.delete({ where: { code } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "currency.deleted", entityType: "Currency", entityId: code, before: currency });
  }

  private async nameOf(userId: string) {
    return (await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? null;
  }
}
