import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ERROR_CODES,
  FINANCE_CATEGORY_DIRECTION,
  FINANCE_CATEGORY_LABELS,
  MAX_RECEIPT_BYTES,
  PAYMENT_METHODS,
  type FinanceBookingRow,
  type FinanceBookingsPage,
  type FinanceBookingsQuery,
  type FinanceEntryData,
  type FinanceOverview,
  type FinanceRange,
  type LedgerKind,
  type LedgerPage,
  type LedgerQuery,
  type LedgerRow,
  type LedgerTotals,
  type MethodTotals,
  type PaymentMethod,
} from "@mashkoor/shared";
import type { BookingStatus, Prisma } from "@prisma/client";
import { fromDateOnly, toDateOnly } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { StorageService } from "../../../core/storage/storage.service";
import { safeFileName, sniff } from "../../trip-experience/domain/booking-documents.service";

const IST_MS = 5.5 * 3600 * 1000;
const istDate = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const startOf = (day: string) => new Date(`${day}T00:00:00.000+05:30`);
const endOf = (day: string) => new Date(`${day}T23:59:59.999+05:30`);
const today = () => istDate(new Date());
const monthStart = () => `${today().slice(0, 8)}01`;

/** Bookings whose money is still moving: owed by the customer, and to suppliers. */
const LIVE_BOOKINGS: BookingStatus[] = ["PENDING_PAYMENT", "IN_PROGRESS", "CONFIRMED", "COMPLETED"];
/** A cap on how much one screen reads at a time; far above what an agency this size produces in a period. */
const LIMIT = 20000;
const RECEIPTS = "receipts";

const dateFilter = (from?: string, to?: string) => ({ ...(from ? { gte: startOf(from) } : {}), ...(to ? { lte: endOf(to) } : {}) });

const invalid = (message: string) => new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_FAILED, message);

const totalsOf = (rows: { direction: "IN" | "OUT"; amount: number }[]): LedgerTotals => {
  let inn = 0;
  let out = 0;
  for (const r of rows) {
    if (r.direction === "IN") inn += r.amount;
    else out += r.amount;
  }
  return { in: inn, out, net: inn - out, count: rows.length };
};

const manualInclude = {
  booking: { select: { id: true, refNo: true } },
  reversal: { select: { id: true } },
  reversalOf: { select: { entryNo: true } },
} satisfies Prisma.FinanceEntryInclude;
type ManualEntry = Prisma.FinanceEntryGetPayload<{ include: typeof manualInclude }>;

/**
 * Accounts. One ledger of every rupee that moved, built from three places that already hold the facts — verified customer
 * payments and refunds, partner wallet top-ups, and the finance entries staff record for what we pay out — so nothing is
 * typed twice and the figures can never disagree with the booking and invoice screens.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ─── The ledger ───────────────────────────────────────────────────────────

  /** Every movement in the period (or ever, without one), newest first. */
  private async loadRows(from?: string, to?: string): Promise<LedgerRow[]> {
    const range = dateFilter(from, to);
    const ranged = Object.keys(range).length > 0;

    const [payments, topups, manual, forexTxns, forexBuys] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: "VERIFIED", ...(ranged ? { OR: [{ verifiedAt: range }, { verifiedAt: null, createdAt: range }] } : {}) },
        include: { booking: { select: { id: true, refNo: true, customer: { select: { fullName: true } } } }, invoice: { select: { id: true, refNo: true } } },
        take: LIMIT,
      }),
      this.prisma.walletLedgerEntry.findMany({
        where: { type: "TOPUP", ...(ranged ? { createdAt: range } : {}) },
        include: { walletAccount: { select: { partner: { select: { id: true, refNo: true, companyName: true } } } } },
        take: LIMIT,
      }),
      this.prisma.financeEntry.findMany({
        where: from || to ? { entryDate: { ...(from ? { gte: fromDateOnly(from)! } : {}), ...(to ? { lte: fromDateOnly(to)! } : {}) } } : {},
        include: manualInclude,
        take: LIMIT,
      }),
      // Forex desk: customer sales and buy-backs, and stock bought from dealers. Cancelled ones never moved any money.
      this.prisma.forexTransaction.findMany({ where: { cancelledAt: null, ...(ranged ? { createdAt: range } : {}) }, take: LIMIT }),
      this.prisma.forexPurchase.findMany({
        where: { cancelledAt: null, ...(from || to ? { purchaseDate: { ...(from ? { gte: fromDateOnly(from)! } : {}), ...(to ? { lte: fromDateOnly(to)! } : {}) } } : {}) },
        take: LIMIT,
      }),
    ]);

    const people = await this.userNames([
      ...payments.map((p) => p.verifiedById ?? p.recordedById),
      ...topups.map((t) => t.createdById),
      ...manual.map((m) => m.recordedById),
      ...forexTxns.map((t) => t.createdById),
      ...forexBuys.map((b) => b.createdById),
    ]);

    const rows: LedgerRow[] = [
      ...payments.map((p): LedgerRow => {
        const refund = p.direction === "REFUND";
        const at = p.verifiedAt ?? p.createdAt;
        return {
          key: `PAYMENT:${p.id}`,
          source: "PAYMENT",
          sourceId: p.id,
          entryNo: p.receiptNo,
          date: istDate(at),
          at: at.toISOString(),
          direction: refund ? "OUT" : "IN",
          amount: p.amount,
          method: p.method,
          kind: refund ? "CUSTOMER_REFUND" : "CUSTOMER_PAYMENT",
          party: p.booking.customer.fullName,
          description: `${refund ? "Refund" : "Payment"} for ${p.booking.refNo}${p.invoice ? ` (${p.invoice.refNo})` : ""}`,
          reference: p.reference ?? p.gatewayRef,
          booking: { id: p.booking.id, refNo: p.booking.refNo },
          invoice: p.invoice,
          partner: null,
          recordedBy: people.get(p.verifiedById ?? p.recordedById ?? "") ?? (p.method === "GATEWAY" ? "Payment gateway" : null),
          hasReceipt: false,
          reversed: false,
          reversalOf: null,
          notes: p.notes,
        };
      }),
      ...topups.map((t): LedgerRow => {
        const partner = t.walletAccount.partner;
        return {
          key: `WALLET:${t.id}`,
          source: "WALLET",
          sourceId: t.id,
          entryNo: null,
          date: istDate(t.createdAt),
          at: t.createdAt.toISOString(),
          direction: "IN",
          amount: t.amount,
          method: null,
          kind: "WALLET_TOPUP",
          party: partner.companyName,
          description: `Wallet top-up for ${partner.companyName}`,
          reference: null,
          booking: null,
          invoice: null,
          partner: { id: partner.id, refNo: partner.refNo },
          recordedBy: people.get(t.createdById ?? "") ?? null,
          hasReceipt: false,
          reversed: false,
          reversalOf: null,
          notes: t.note,
        };
      }),
      ...manual.map((m): LedgerRow => this.manualRow(m, people)),
      ...forexTxns.map((t): LedgerRow => {
        const selling = t.type === "SELL";
        return {
          key: `FOREX:${t.id}`,
          source: "FOREX",
          sourceId: t.id,
          entryNo: t.refNo,
          date: istDate(t.createdAt),
          at: t.createdAt.toISOString(),
          direction: selling ? "IN" : "OUT",
          amount: t.inrAmount,
          method: t.paymentMethod,
          kind: selling ? "FOREX_SALE" : "FOREX_BUYBACK",
          party: t.customerName,
          description: `${selling ? "Sold" : "Bought"} ${t.foreignAmount.toLocaleString("en-IN")} ${t.currency} at ₹${t.rate}`,
          reference: t.reference,
          booking: null,
          invoice: null,
          partner: null,
          recordedBy: people.get(t.createdById ?? "") ?? null,
          hasReceipt: false,
          reversed: false,
          reversalOf: null,
          notes: t.notes,
        };
      }),
      ...forexBuys.map(
        (b): LedgerRow => ({
          key: `FOREX:P${b.id}`,
          source: "FOREX",
          sourceId: b.id,
          entryNo: null,
          date: toDateOnly(b.purchaseDate)!,
          at: b.createdAt.toISOString(),
          direction: "OUT",
          amount: b.inrAmount,
          method: b.paymentMethod,
          kind: "FOREX_PURCHASE",
          party: b.supplier,
          description: `Bought ${b.foreignAmount.toLocaleString("en-IN")} ${b.currency} at ₹${b.rate}`,
          reference: b.reference,
          booking: null,
          invoice: null,
          partner: null,
          recordedBy: people.get(b.createdById ?? "") ?? null,
          hasReceipt: false,
          reversed: false,
          reversalOf: null,
          notes: b.notes,
        }),
      ),
    ];

    return rows.sort((a, b) => (a.date === b.date ? b.at.localeCompare(a.at) : b.date.localeCompare(a.date)));
  }

  private manualRow(m: ManualEntry, people: Map<string, string>): LedgerRow {
    return {
      key: `MANUAL:${m.id}`,
      source: "MANUAL",
      sourceId: m.id,
      entryNo: m.entryNo,
      date: toDateOnly(m.entryDate)!,
      at: m.createdAt.toISOString(),
      direction: m.direction,
      amount: m.amount,
      method: m.method,
      kind: m.category,
      party: m.party,
      description: m.reversalOf ? `${FINANCE_CATEGORY_LABELS[m.category]} — cancels ${m.reversalOf.entryNo}` : FINANCE_CATEGORY_LABELS[m.category],
      reference: m.reference,
      booking: m.booking,
      invoice: null,
      partner: null,
      recordedBy: people.get(m.recordedById ?? "") ?? null,
      hasReceipt: Boolean(m.receiptKey),
      reversed: Boolean(m.reversal),
      reversalOf: m.reversalOf?.entryNo ?? null,
      notes: m.notes,
    };
  }

  private async userNames(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async ledger(query: LedgerQuery): Promise<LedgerPage> {
    const needle = query.q?.toLowerCase();
    const matches = (await this.loadRows(query.from, query.to)).filter(
      (r) =>
        (!query.direction || r.direction === query.direction) &&
        (!query.method || r.method === query.method) &&
        (!query.kind || r.kind === query.kind) &&
        (!query.bookingId || r.booking?.id === query.bookingId) &&
        (!needle || [r.party, r.entryNo, r.reference, r.booking?.refNo, r.invoice?.refNo, r.description, r.notes].some((v) => v?.toLowerCase().includes(needle))),
    );
    const start = (query.page - 1) * query.pageSize;
    return { rows: matches.slice(start, start + query.pageSize), totals: totalsOf(matches), meta: { page: query.page, pageSize: query.pageSize, total: matches.length } };
  }

  // ─── Overview ─────────────────────────────────────────────────────────────

  async overview(range: FinanceRange): Promise<FinanceOverview> {
    const from = range.from ?? monthStart();
    const to = range.to ?? today();
    if (to < from) throw invalid("The end date must be on or after the start date");

    const rows = await this.loadRows(from, to);

    const sumBy = (pick: (r: LedgerRow) => string | null, direction: "IN" | "OUT") => {
      const map = new Map<string, number>();
      for (const r of rows) if (r.direction === direction) map.set(pick(r) ?? "", (map.get(pick(r) ?? "") ?? 0) + r.amount);
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    };
    const byMethod = this.methodTotals(rows.map((r) => ({ method: r.method ?? "OTHER", direction: r.direction, amount: r.amount })));

    const daily = new Map<string, { in: number; out: number }>();
    for (const r of rows) {
      const d = daily.get(r.date) ?? { in: 0, out: 0 };
      d[r.direction === "IN" ? "in" : "out"] += r.amount;
      daily.set(r.date, d);
    }

    const [balances, pending, figures] = await Promise.all([this.balancesUpTo(to), this.pendingPayments(), this.bookingFigures()]);

    return {
      period: { from, to },
      totals: totalsOf(rows),
      byMethod,
      balances,
      inByKind: sumBy((r) => r.kind, "IN").map(([kind, amount]) => ({ kind: kind as LedgerKind, amount })),
      outByKind: sumBy((r) => r.kind, "OUT").map(([kind, amount]) => ({ kind: kind as LedgerKind, amount })),
      daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
      awaitingVerification: pending,
      receivables: { amount: figures.reduce((n, b) => n + b.receivable, 0), bookings: figures.filter((b) => b.receivable > 0).length },
      payables: { amount: figures.reduce((n, b) => n + b.supplierDue, 0), bookings: figures.filter((b) => b.supplierDue > 0).length },
    };
  }

  private methodTotals(items: { method: PaymentMethod; direction: "IN" | "OUT"; amount: number }[]): MethodTotals[] {
    return PAYMENT_METHODS.map((method) => {
      const mine = items.filter((i) => i.method === method);
      const t = totalsOf(mine);
      return { method, in: t.in, out: t.out, net: t.net };
    }).filter((m) => m.in !== 0 || m.out !== 0);
  }

  /** What each method should hold: every movement from the beginning up to the end of the period. Done in the database, not row by row. */
  private async balancesUpTo(to: string): Promise<MethodTotals[]> {
    const cutoff = endOf(to);
    const [payments, manual, topups, forexTxns, forexBuys] = await Promise.all([
      this.prisma.payment.groupBy({ by: ["method", "direction"], where: { status: "VERIFIED", OR: [{ verifiedAt: { lte: cutoff } }, { verifiedAt: null, createdAt: { lte: cutoff } }] }, _sum: { amount: true } }),
      this.prisma.financeEntry.groupBy({ by: ["method", "direction"], where: { entryDate: { lte: fromDateOnly(to)! } }, _sum: { amount: true } }),
      this.prisma.walletLedgerEntry.aggregate({ where: { type: "TOPUP", createdAt: { lte: cutoff } }, _sum: { amount: true } }),
      this.prisma.forexTransaction.groupBy({ by: ["paymentMethod", "type"], where: { cancelledAt: null, createdAt: { lte: cutoff } }, _sum: { inrAmount: true } }),
      this.prisma.forexPurchase.groupBy({ by: ["paymentMethod"], where: { cancelledAt: null, purchaseDate: { lte: fromDateOnly(to)! } }, _sum: { inrAmount: true } }),
    ]);
    return this.methodTotals([
      ...payments.map((p) => ({ method: p.method, direction: (p.direction === "REFUND" ? "OUT" : "IN") as "IN" | "OUT", amount: p._sum.amount ?? 0 })),
      ...manual.map((m) => ({ method: m.method, direction: m.direction, amount: m._sum.amount ?? 0 })),
      { method: "OTHER", direction: "IN", amount: topups._sum.amount ?? 0 },
      ...forexTxns.map((t) => ({ method: t.paymentMethod, direction: (t.type === "SELL" ? "IN" : "OUT") as "IN" | "OUT", amount: t._sum.inrAmount ?? 0 })),
      ...forexBuys.map((b) => ({ method: b.paymentMethod, direction: "OUT" as const, amount: b._sum.inrAmount ?? 0 })),
    ]);
  }

  private async pendingPayments() {
    const pending = await this.prisma.payment.aggregate({ where: { status: "PENDING", direction: "COLLECTION" }, _sum: { amount: true }, _count: true });
    return { count: pending._count, amount: pending._sum.amount ?? 0 };
  }

  // ─── Bookings: collected vs paid out ──────────────────────────────────────

  private async bookingFigures(filter: Prisma.BookingWhereInput = {}, statuses: BookingStatus[] = LIVE_BOOKINGS): Promise<FinanceBookingRow[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { AND: [{ status: { in: statuses } }, filter] },
      select: {
        id: true,
        refNo: true,
        status: true,
        travelFrom: true,
        totalSell: true,
        totalCost: true,
        customer: { select: { id: true, fullName: true } },
        payments: { where: { status: "VERIFIED" }, select: { amount: true, direction: true } },
        financeEntries: { where: { category: { in: ["SUPPLIER_PAYMENT", "SUPPLIER_REFUND"] } }, select: { amount: true, direction: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    return bookings.map((b) => {
      const collected = b.payments.reduce((n, p) => n + (p.direction === "COLLECTION" ? p.amount : -p.amount), 0);
      // Money out to suppliers, less anything they sent back (and less a cancelled payment, which is recorded as money in).
      const supplierPaid = b.financeEntries.reduce((n, e) => n + (e.direction === "OUT" ? e.amount : -e.amount), 0);
      return {
        id: b.id,
        refNo: b.refNo,
        customer: b.customer,
        status: b.status,
        travelFrom: toDateOnly(b.travelFrom),
        sell: b.totalSell,
        collected,
        receivable: Math.max(0, b.totalSell - collected),
        cost: b.totalCost,
        supplierPaid,
        supplierDue: Math.max(0, b.totalCost - supplierPaid),
        cashMargin: collected - supplierPaid,
        expectedMargin: b.totalSell - b.totalCost,
      };
    });
  }

  async bookings(query: FinanceBookingsQuery): Promise<FinanceBookingsPage> {
    const needle = query.q;
    const filter: Prisma.BookingWhereInput = needle ? { OR: [{ refNo: { contains: needle, mode: "insensitive" } }, { customer: { fullName: { contains: needle, mode: "insensitive" } } }, { customer: { phone: { contains: needle } } }] } : {};
    const all = (await this.bookingFigures(filter)).filter((b) => (query.show === "owing" ? b.receivable > 0 : query.show === "supplier-due" ? b.supplierDue > 0 : true));
    const sum = (pick: (b: FinanceBookingRow) => number) => all.reduce((n, b) => n + pick(b), 0);
    const start = (query.page - 1) * query.pageSize;
    return {
      rows: all.slice(start, start + query.pageSize),
      totals: { sell: sum((b) => b.sell), collected: sum((b) => b.collected), receivable: sum((b) => b.receivable), cost: sum((b) => b.cost), supplierPaid: sum((b) => b.supplierPaid), supplierDue: sum((b) => b.supplierDue), cashMargin: sum((b) => b.cashMargin), expectedMargin: sum((b) => b.expectedMargin) },
      meta: { page: query.page, pageSize: query.pageSize, total: all.length },
    };
  }

  // ─── Recording ────────────────────────────────────────────────────────────

  async create(actor: RequestUser, input: FinanceEntryData): Promise<LedgerRow> {
    if (input.bookingId && !(await this.prisma.booking.findUnique({ where: { id: input.bookingId }, select: { id: true } }))) throw AppError.notFound("Booking");

    const entryNo = await this.sequences.next("finance");
    const created = await this.prisma.financeEntry.create({
      data: {
        entryNo,
        direction: FINANCE_CATEGORY_DIRECTION[input.category],
        category: input.category,
        amount: input.amount,
        entryDate: fromDateOnly(input.entryDate)!,
        method: input.method,
        party: input.party,
        bookingId: input.bookingId,
        reference: input.reference,
        notes: input.notes,
        recordedById: actor.id,
      },
      include: manualInclude,
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "finance.entry_recorded", entityType: "FinanceEntry", entityId: created.id, after: { entryNo, category: input.category, amount: input.amount, method: input.method, party: input.party } });
    return this.manualRow(created, await this.userNames([actor.id]));
  }

  /** Cancels an entry by adding the opposite one. The original is never edited or removed, so the trail stays complete. */
  async reverse(actor: RequestUser, id: string, reason: string): Promise<LedgerRow> {
    const original = await this.prisma.financeEntry.findUnique({ where: { id }, include: manualInclude });
    if (!original) throw AppError.notFound("Entry");
    if (original.reversalOf) throw AppError.conflict("This entry is itself a cancellation and can't be cancelled again");
    if (original.reversal) throw AppError.conflict("This entry has already been cancelled");

    const entryNo = await this.sequences.next("finance");
    try {
      const created = await this.prisma.financeEntry.create({
        data: {
          entryNo,
          direction: original.direction === "IN" ? "OUT" : "IN",
          category: original.category,
          amount: original.amount,
          entryDate: fromDateOnly(new Date().toISOString().slice(0, 10))!,
          method: original.method,
          party: original.party,
          bookingId: original.bookingId,
          reference: original.reference,
          notes: reason,
          reversalOfId: original.id,
          recordedById: actor.id,
        },
        include: manualInclude,
      });
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "finance.entry_reversed", entityType: "FinanceEntry", entityId: original.id, after: { entryNo, reverses: original.entryNo, reason } });
      return this.manualRow(created, await this.userNames([actor.id]));
    } catch (error) {
      // The unique link from the cancellation back to the original: two people cancelling at once can't both succeed.
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("This entry has already been cancelled");
      throw error;
    }
  }

  /** Suppliers and payees used before, newest first — feeds the name suggestions on the form. */
  async parties(): Promise<string[]> {
    const rows = await this.prisma.financeEntry.findMany({ where: { party: { not: null } }, distinct: ["party"], orderBy: { createdAt: "desc" }, select: { party: true }, take: 200 });
    return rows.map((r) => r.party!).filter(Boolean);
  }

  // ─── Receipts ─────────────────────────────────────────────────────────────

  async attachReceipt(actor: RequestUser, id: string, fileName: string, body: Buffer) {
    const entry = await this.prisma.financeEntry.findUnique({ where: { id }, select: { id: true, receiptKey: true, reversalOfId: true } });
    if (!entry) throw AppError.notFound("Entry");
    if (body.length === 0) throw invalid("The file is empty");
    if (body.length > MAX_RECEIPT_BYTES) throw invalid(`Files can be up to ${MAX_RECEIPT_BYTES / 1024 / 1024} MB`);
    const type = sniff(body);
    if (!type) throw invalid("Upload a PDF, JPEG, PNG or WebP file");

    const stored = await this.storage.save(RECEIPTS, body);
    try {
      await this.prisma.financeEntry.update({ where: { id }, data: { receiptKey: stored.key, receiptSha: stored.sha256, receiptName: safeFileName(fileName), receiptMime: type } });
    } catch (error) {
      await this.storage.remove(stored.key).catch(() => undefined);
      throw error;
    }
    if (entry.receiptKey) await this.storage.remove(entry.receiptKey).catch(() => undefined);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "finance.receipt_attached", entityType: "FinanceEntry", entityId: id });
    return { ok: true };
  }

  async downloadReceipt(id: string) {
    const entry = await this.prisma.financeEntry.findUnique({ where: { id }, select: { receiptKey: true, receiptSha: true, receiptName: true, receiptMime: true } });
    if (!entry?.receiptKey) throw AppError.notFound("Receipt");
    const data = await this.storage.read(entry.receiptKey, entry.receiptSha ?? undefined);
    return { fileName: entry.receiptName ?? "receipt", mimeType: entry.receiptMime ?? "application/octet-stream", data };
  }
}
