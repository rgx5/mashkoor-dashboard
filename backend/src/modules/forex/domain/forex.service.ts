import { HttpStatus, Injectable } from "@nestjs/common";
import {
  BASE_CURRENCY,
  ERROR_CODES,
  FOREX_PAN_THRESHOLD,
  forexInr,
  type ForexOverview,
  type ForexPosition,
  type ForexPurchaseData,
  type ForexPurchaseListQuery,
  type ForexPurchaseRow,
  type ForexRatesUpdateData,
  type ForexTransactionData,
  type ForexTransactionListQuery,
  type ForexTransactionRow,
  type Paginated,
} from "@mashkoor/shared";
import type { ForexPurchase, ForexTransaction, Prisma } from "@prisma/client";
import { fromDateOnly, paginate, toDateOnly } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const IST_MS = 5.5 * 3600 * 1000;
const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const startOf = (day: string) => new Date(`${day}T00:00:00.000+05:30`);
const endOf = (day: string) => new Date(`${day}T23:59:59.999+05:30`);
const round2 = (n: number) => Math.round(n * 100) / 100;

const invalid = (message: string, field?: string) => new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_FAILED, field ? "Please check the highlighted fields" : message, field ? { fieldErrors: { [field]: message } } : undefined);

type TxnWithCustomer = ForexTransaction & { customer: { id: string; refNo: string } | null };

const txnRow = (t: TxnWithCustomer, people: Map<string, string>): ForexTransactionRow => ({
  id: t.id,
  refNo: t.refNo,
  type: t.type,
  form: t.form,
  customer: t.customer,
  customerName: t.customerName,
  phone: t.phone,
  currency: t.currency,
  foreignAmount: t.foreignAmount,
  rate: t.rate,
  inrAmount: t.inrAmount,
  paymentMethod: t.paymentMethod,
  passportNo: t.passportNo,
  panNo: t.panNo,
  purpose: t.purpose,
  reference: t.reference,
  notes: t.notes,
  margin: t.type === "SELL" && t.costRate != null ? t.inrAmount - forexInr(t.foreignAmount, t.costRate) : null,
  cancelledAt: t.cancelledAt?.toISOString() ?? null,
  cancelReason: t.cancelReason,
  createdBy: people.get(t.createdById ?? "") ?? null,
  createdAt: t.createdAt.toISOString(),
});

const purchaseRow = (p: ForexPurchase, people: Map<string, string>): ForexPurchaseRow => ({
  id: p.id,
  currency: p.currency,
  foreignAmount: p.foreignAmount,
  rate: p.rate,
  inrAmount: p.inrAmount,
  supplier: p.supplier,
  paymentMethod: p.paymentMethod,
  purchaseDate: toDateOnly(p.purchaseDate)!,
  reference: p.reference,
  notes: p.notes,
  cancelledAt: p.cancelledAt?.toISOString() ?? null,
  cancelReason: p.cancelReason,
  createdBy: people.get(p.createdById ?? "") ?? null,
  createdAt: p.createdAt.toISOString(),
});

/**
 * The forex desk. Mashkoor buys foreign currency from dealers (purchases), sells it to customers at its own sell rate with
 * the passport and PAN details the rules ask for, and can buy notes back. Stock is never typed in: it is every purchase and
 * buy-back less every sale, so it can't drift from the transactions. A mistake is cancelled with a reason, which puts the
 * stock back. The rupees that move land on the Accounts ledger.
 */
@Injectable()
export class ForexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  // ─── Stock and rates ──────────────────────────────────────────────────────

  /** Every currency the desk could deal in, with its stock, what that stock cost, and the rates on it. */
  async positions(): Promise<ForexPosition[]> {
    const [currencies, purchases, txns] = await Promise.all([
      this.prisma.currency.findMany({ where: { code: { not: BASE_CURRENCY } }, orderBy: { code: "asc" } }),
      this.prisma.forexPurchase.groupBy({ by: ["currency"], where: { cancelledAt: null }, _sum: { foreignAmount: true, inrAmount: true } }),
      this.prisma.forexTransaction.groupBy({ by: ["currency", "type"], where: { cancelledAt: null }, _sum: { foreignAmount: true, inrAmount: true } }),
    ]);
    return currencies.map((c) => {
      const bought = purchases.find((p) => p.currency === c.code)?._sum;
      const buyBack = txns.find((t) => t.currency === c.code && t.type === "BUY")?._sum;
      const sold = txns.find((t) => t.currency === c.code && t.type === "SELL")?._sum;
      const inflowUnits = (bought?.foreignAmount ?? 0) + (buyBack?.foreignAmount ?? 0);
      const inflowInr = (bought?.inrAmount ?? 0) + (buyBack?.inrAmount ?? 0);
      const stock = round2(inflowUnits - (sold?.foreignAmount ?? 0));
      // A simple weighted average of everything that has come in, so the cost of a sale is the same whoever serves it.
      const avgCost = inflowUnits > 0 ? inflowInr / inflowUnits : null;
      return {
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        stock,
        avgCost,
        buyRate: c.buyRate,
        sellRate: c.sellRate,
        marginPerUnit: avgCost != null && c.sellRate != null ? c.sellRate - avgCost : null,
        stockValue: avgCost != null ? Math.round(stock * avgCost) : 0,
        offered: c.active && c.sellRate != null,
      };
    });
  }

  async overview(): Promise<ForexOverview> {
    const now = new Date();
    const today = istDate(now);
    const monthStart = `${today.slice(0, 8)}01`;
    const [positions, todaySales, monthSales] = await Promise.all([
      this.positions(),
      this.prisma.forexTransaction.aggregate({ where: { type: "SELL", cancelledAt: null, createdAt: { gte: startOf(today), lte: endOf(today) } }, _sum: { inrAmount: true }, _count: true }),
      this.prisma.forexTransaction.findMany({ where: { type: "SELL", cancelledAt: null, createdAt: { gte: startOf(monthStart), lte: endOf(today) } }, select: { inrAmount: true, foreignAmount: true, costRate: true } }),
    ]);
    return {
      positions,
      today: { sales: todaySales._sum.inrAmount ?? 0, count: todaySales._count },
      month: {
        sales: monthSales.reduce((n, t) => n + t.inrAmount, 0),
        margin: monthSales.reduce((n, t) => n + (t.costRate != null ? t.inrAmount - forexInr(t.foreignAmount, t.costRate) : 0), 0),
        count: monthSales.length,
      },
      stockValue: positions.reduce((n, p) => n + p.stockValue, 0),
    };
  }

  async updateRates(actor: RequestUser, input: ForexRatesUpdateData) {
    if (!this.abilities.forUser(actor).can("manage", "ForexTransaction")) throw AppError.forbidden();
    const codes = input.rates.map((r) => r.code);
    if (codes.includes(BASE_CURRENCY)) throw invalid(`${BASE_CURRENCY} is the base currency and can't be traded`);
    const before = await this.prisma.currency.findMany({ where: { code: { in: codes } } });
    if (before.length !== codes.length) throw AppError.notFound("Currency");

    const changes = input.rates.filter((r) => {
      const c = before.find((b) => b.code === r.code)!;
      return c.buyRate !== r.buyRate || c.sellRate !== r.sellRate;
    });
    await this.prisma.$transaction(changes.map((r) => this.prisma.currency.update({ where: { code: r.code }, data: { buyRate: r.buyRate, sellRate: r.sellRate, updatedById: actor.id } })));
    if (changes.length > 0) {
      await this.audit.record({
        actorId: actor.id,
        portal: actor.portal,
        action: "forex.rates_updated",
        entityType: "Currency",
        before: Object.fromEntries(changes.map((r) => [r.code, { buy: before.find((b) => b.code === r.code)!.buyRate, sell: before.find((b) => b.code === r.code)!.sellRate }])),
        after: Object.fromEntries(changes.map((r) => [r.code, { buy: r.buyRate, sell: r.sellRate }])),
      });
    }
    return { changed: changes.length };
  }

  // ─── Customer transactions ────────────────────────────────────────────────

  async listTransactions(query: ForexTransactionListQuery): Promise<Paginated<ForexTransactionRow>> {
    const where: Prisma.ForexTransactionWhereInput = {
      AND: [
        query.status === "active" ? { cancelledAt: null } : query.status === "cancelled" ? { cancelledAt: { not: null } } : {},
        query.type ? { type: query.type } : {},
        query.currency ? { currency: query.currency } : {},
        query.from || query.to ? { createdAt: { ...(query.from ? { gte: startOf(query.from) } : {}), ...(query.to ? { lte: endOf(query.to) } : {}) } } : {},
        query.q
          ? { OR: [{ refNo: { contains: query.q, mode: "insensitive" } }, { customerName: { contains: query.q, mode: "insensitive" } }, { phone: { contains: query.q } }, { passportNo: { contains: query.q, mode: "insensitive" } }] }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.forexTransaction.findMany({ where, include: { customer: { select: { id: true, refNo: true } } }, orderBy: { createdAt: "desc" }, ...paginate(query.page, query.pageSize) }),
      this.prisma.forexTransaction.count({ where }),
    ]);
    const people = await this.userNames(rows.map((r) => r.createdById));
    return { data: rows.map((r) => txnRow(r, people)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async createTransaction(actor: RequestUser, input: ForexTransactionData): Promise<ForexTransactionRow> {
    if (!this.abilities.forUser(actor).can("create", "ForexTransaction")) throw AppError.forbidden();
    const selling = input.type === "SELL";

    const currency = await this.prisma.currency.findUnique({ where: { code: input.currency } });
    if (!currency || currency.code === BASE_CURRENCY || !currency.active) throw invalid("This currency isn't available at the counter", "currency");
    const deskRate = selling ? currency.sellRate : currency.buyRate;
    if (deskRate == null && input.rate == null) throw invalid(`${currency.code} has no ${selling ? "sell" : "buy"} rate set. Set one on the Forex page first.`, "currency");
    const rate = input.rate ?? deskRate!;
    const inrAmount = forexInr(input.foreignAmount, rate);
    if (inrAmount < 1) throw invalid("That comes to less than ₹1", "foreignAmount");

    if (selling && inrAmount >= FOREX_PAN_THRESHOLD && !input.panNo) throw invalid(`A PAN is needed for a sale of ₹${FOREX_PAN_THRESHOLD.toLocaleString("en-IN")} or more`, "panNo");
    if (input.customerId && !(await this.prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }))) throw AppError.notFound("Customer");

    const position = (await this.positions()).find((p) => p.code === currency.code)!;
    if (selling && input.foreignAmount > position.stock) throw invalid(`Only ${position.stock.toLocaleString("en-IN")} ${currency.code} in stock. Record a purchase from a dealer first.`, "foreignAmount");

    const refNo = await this.sequences.next("forex");
    const created = await this.prisma.forexTransaction.create({
      data: {
        refNo,
        type: input.type,
        form: input.form,
        customerId: input.customerId,
        customerName: input.customerName,
        phone: input.phone,
        currency: currency.code,
        foreignAmount: input.foreignAmount,
        rate,
        inrAmount,
        costRate: selling ? position.avgCost : null,
        paymentMethod: input.paymentMethod,
        passportNo: input.passportNo,
        panNo: input.panNo,
        purpose: input.purpose,
        reference: input.reference,
        notes: input.notes,
        createdById: actor.id,
      },
      include: { customer: { select: { id: true, refNo: true } } },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "forex.transaction_recorded", entityType: "ForexTransaction", entityId: created.id, after: { refNo, type: input.type, currency: currency.code, foreignAmount: input.foreignAmount, rate, inrAmount } });
    return txnRow(created, await this.userNames([actor.id]));
  }

  async cancelTransaction(actor: RequestUser, id: string, reason: string): Promise<ForexTransactionRow> {
    if (!this.abilities.forUser(actor).can("update", "ForexTransaction")) throw AppError.forbidden();
    const txn = await this.prisma.forexTransaction.findUnique({ where: { id }, include: { customer: { select: { id: true, refNo: true } } } });
    if (!txn) throw AppError.notFound("Transaction");
    if (txn.cancelledAt) throw AppError.conflict("This transaction is already cancelled");
    // Cancelling money-in-notes (a buy-back) takes those notes out of stock, so they must still be there.
    if (txn.type === "BUY") await this.assertStockCovers(txn.currency, txn.foreignAmount, "Those notes have already been sold on, so this buy-back can't be cancelled");

    const updated = await this.prisma.forexTransaction.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason }, include: { customer: { select: { id: true, refNo: true } } } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "forex.transaction_cancelled", entityType: "ForexTransaction", entityId: id, after: { refNo: txn.refNo, reason } });
    return txnRow(updated, await this.userNames([updated.createdById]));
  }

  // ─── Stock purchases ──────────────────────────────────────────────────────

  async listPurchases(query: ForexPurchaseListQuery): Promise<Paginated<ForexPurchaseRow>> {
    const where: Prisma.ForexPurchaseWhereInput = {
      AND: [query.status === "active" ? { cancelledAt: null } : query.status === "cancelled" ? { cancelledAt: { not: null } } : {}, query.currency ? { currency: query.currency } : {}],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.forexPurchase.findMany({ where, orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }], ...paginate(query.page, query.pageSize) }),
      this.prisma.forexPurchase.count({ where }),
    ]);
    const people = await this.userNames(rows.map((r) => r.createdById));
    return { data: rows.map((r) => purchaseRow(r, people)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async createPurchase(actor: RequestUser, input: ForexPurchaseData): Promise<ForexPurchaseRow> {
    if (!this.abilities.forUser(actor).can("create", "ForexTransaction")) throw AppError.forbidden();
    const currency = await this.prisma.currency.findUnique({ where: { code: input.currency } });
    if (!currency || currency.code === BASE_CURRENCY) throw invalid("Choose a foreign currency", "currency");
    const inrAmount = forexInr(input.foreignAmount, input.rate);
    if (inrAmount < 1) throw invalid("That comes to less than ₹1", "foreignAmount");

    const created = await this.prisma.forexPurchase.create({
      data: { currency: currency.code, foreignAmount: input.foreignAmount, rate: input.rate, inrAmount, supplier: input.supplier, paymentMethod: input.paymentMethod, purchaseDate: fromDateOnly(input.purchaseDate)!, reference: input.reference, notes: input.notes, createdById: actor.id },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "forex.purchase_recorded", entityType: "ForexPurchase", entityId: created.id, after: { currency: currency.code, foreignAmount: input.foreignAmount, rate: input.rate, inrAmount, supplier: input.supplier } });
    return purchaseRow(created, await this.userNames([actor.id]));
  }

  async cancelPurchase(actor: RequestUser, id: string, reason: string): Promise<ForexPurchaseRow> {
    if (!this.abilities.forUser(actor).can("update", "ForexTransaction")) throw AppError.forbidden();
    const purchase = await this.prisma.forexPurchase.findUnique({ where: { id } });
    if (!purchase) throw AppError.notFound("Purchase");
    if (purchase.cancelledAt) throw AppError.conflict("This purchase is already cancelled");
    await this.assertStockCovers(purchase.currency, purchase.foreignAmount, "Some of this stock has already been sold, so the purchase can't be cancelled");

    const updated = await this.prisma.forexPurchase.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "forex.purchase_cancelled", entityType: "ForexPurchase", entityId: id, after: { reason } });
    return purchaseRow(updated, await this.userNames([updated.createdById]));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async assertStockCovers(currency: string, units: number, message: string) {
    const position = (await this.positions()).find((p) => p.code === currency);
    if (!position || position.stock < units) throw AppError.conflict(message);
  }

  private async userNames(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }
}
