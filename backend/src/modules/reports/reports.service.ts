import { HttpStatus, Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import {
  BOOKING_STATUS_LABELS,
  ERROR_CODES,
  LEAD_SOURCE_LABELS,
  PRODUCT_TYPE_LABELS,
  REPORT_INFO,
  type LeadSource,
  type ReportName,
  type ReportQuery,
  type ReportResult,
} from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { toDateOnly } from "../../common/serialize";
import { loadUserRefs } from "../../common/user-refs";
import type { RequestUser } from "../../core/auth/request-user";
import { AppError } from "../../core/http/app-error";
import { PrismaService } from "../../core/prisma/prisma.service";
import { AbilityFactory } from "../../core/rbac/ability.factory";

const IST = "+05:30";
const MS_DAY = 24 * 3600 * 1000;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

interface Range {
  from: string;
  to: string;
  gte: Date;
  lte: Date;
}

type VerifiedPayments = { amount: number; direction: "COLLECTION" | "REFUND" }[];
const netCollected = (payments: VerifiedPayments) => payments.reduce((sum, p) => sum + (p.direction === "COLLECTION" ? p.amount : -p.amount), 0);

/** M14 · Reports. Every report returns the same table shape, so one screen renders (and exports) all of them. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
  ) {}

  run(actor: RequestUser, name: ReportName, query: ReportQuery): Promise<ReportResult> {
    const from = query.from ?? monthStart();
    const to = query.to ?? today();
    if (to < from) throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_FAILED, "The end date must be on or after the start date");
    const range: Range = { from, to, gte: new Date(`${from}T00:00:00.000${IST}`), lte: new Date(`${to}T23:59:59.999${IST}`) };

    switch (name) {
      case "sales":
        return this.sales(actor, range);
      case "ageing":
        return this.ageing(actor);
      case "daybook":
        return this.daybook(actor, range);
      case "lead-sources":
        return this.leadSources(actor, range);
      case "staff-performance":
        return this.staffPerformance(actor, range);
    }
  }

  // ─── Sales register ───────────────────────────────────────────────────────

  private async sales(actor: RequestUser, range: Range): Promise<ReportResult> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", "Booking")) throw AppError.forbidden();
    // Cost and margin are manager-only, exactly as on the booking screens.
    const showCost = ability.can("manage", "Booking");

    const bookings = await this.prisma.booking.findMany({
      where: { AND: [accessibleBy(ability).Booking, { createdAt: { gte: range.gte, lte: range.lte }, status: { notIn: ["CANCELLED", "FAILED", "INQUIRY"] } }] },
      include: {
        customer: { select: { fullName: true } },
        owner: { select: { name: true } },
        payments: { where: { status: "VERIFIED" }, select: { amount: true, direction: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const rows = bookings.map((b) => {
      const collected = netCollected(b.payments);
      const row: Record<string, string | number | null> = {
        date: toDateOnly(b.createdAt),
        refNo: b.refNo,
        customer: b.customer.fullName,
        type: PRODUCT_TYPE_LABELS[b.productType],
        status: BOOKING_STATUS_LABELS[b.status],
        owner: b.owner?.name ?? "Unassigned",
        sell: b.totalSell,
      };
      if (showCost) {
        row.cost = b.totalCost;
        row.margin = b.totalSell - b.totalCost;
      }
      row.collected = collected;
      row.due = Math.max(0, b.totalSell - collected);
      return row;
    });
    const total = (key: string) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);

    return {
      name: "sales",
      title: REPORT_INFO.sales.title,
      period: { from: range.from, to: range.to },
      summary: [
        { label: "Bookings", value: rows.length, kind: "number" },
        { label: "Sales value", value: total("sell"), kind: "money" },
        ...(showCost ? [{ label: "Margin", value: total("margin"), kind: "money" as const }] : []),
        { label: "Collected", value: total("collected"), kind: "money" },
        { label: "Outstanding", value: total("due"), kind: "money" },
      ],
      columns: [
        { key: "date", label: "Date", kind: "date" },
        { key: "refNo", label: "Booking", kind: "text" },
        { key: "customer", label: "Customer", kind: "text" },
        { key: "type", label: "Trip", kind: "text" },
        { key: "status", label: "Status", kind: "text" },
        { key: "owner", label: "Owner", kind: "text" },
        { key: "sell", label: "Sell price", kind: "money" },
        ...(showCost ? [{ key: "cost", label: "Cost", kind: "money" as const }, { key: "margin", label: "Margin", kind: "money" as const }] : []),
        { key: "collected", label: "Collected", kind: "money" },
        { key: "due", label: "Due", kind: "money" },
      ],
      rows,
    };
  }

  // ─── Receivables ageing ───────────────────────────────────────────────────

  private async ageing(actor: RequestUser): Promise<ReportResult> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", "Booking")) throw AppError.forbidden();

    const bookings = await this.prisma.booking.findMany({
      where: { AND: [accessibleBy(ability).Booking, { status: { in: ["PENDING_PAYMENT", "IN_PROGRESS", "CONFIRMED", "COMPLETED"] } }] },
      include: { customer: { select: { fullName: true, phone: true } }, payments: { where: { status: "VERIFIED" }, select: { amount: true, direction: true } } },
      take: 5000,
    });

    const now = Date.now();
    const buckets = ["0–30 days", "31–60 days", "61–90 days", "90+ days"] as const;
    const bucketFor = (days: number) => buckets[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3];
    const bucketTotals = new Map<string, number>(buckets.map((b) => [b, 0]));

    const rows = bookings
      .map((b) => {
        const collected = netCollected(b.payments);
        const ageDays = Math.floor((now - b.createdAt.getTime()) / MS_DAY);
        return {
          refNo: b.refNo,
          customer: b.customer.fullName,
          phone: b.customer.phone,
          travelFrom: toDateOnly(b.travelFrom),
          sell: b.totalSell,
          collected,
          due: b.totalSell - collected,
          ageDays,
          bucket: bucketFor(ageDays) as string,
        };
      })
      .filter((row) => row.due > 0)
      .sort((a, b) => b.ageDays - a.ageDays);
    for (const row of rows) bucketTotals.set(row.bucket, (bucketTotals.get(row.bucket) ?? 0) + row.due);

    return {
      name: "ageing",
      title: REPORT_INFO.ageing.title,
      period: { from: today(), to: today() },
      summary: [
        { label: "Total outstanding", value: rows.reduce((sum, row) => sum + row.due, 0), kind: "money" },
        ...buckets.map((b) => ({ label: b, value: bucketTotals.get(b) ?? 0, kind: "money" as const })),
      ],
      columns: [
        { key: "refNo", label: "Booking", kind: "text" },
        { key: "customer", label: "Customer", kind: "text" },
        { key: "phone", label: "Mobile", kind: "text" },
        { key: "travelFrom", label: "Departure", kind: "date" },
        { key: "sell", label: "Sell price", kind: "money" },
        { key: "collected", label: "Collected", kind: "money" },
        { key: "due", label: "Due", kind: "money" },
        { key: "ageDays", label: "Age (days)", kind: "number" },
        { key: "bucket", label: "Bucket", kind: "text" },
      ],
      rows,
    };
  }

  // ─── Daybook ──────────────────────────────────────────────────────────────

  private async daybook(actor: RequestUser, range: Range): Promise<ReportResult> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", "Booking")) throw AppError.forbidden();

    const payments = await this.prisma.payment.findMany({
      where: { AND: [{ booking: accessibleBy(ability).Booking }, { createdAt: { gte: range.gte, lte: range.lte } }] },
      include: { booking: { select: { refNo: true, customer: { select: { fullName: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const users = await loadUserRefs(this.prisma, payments.map((p) => p.recordedById));

    type P = (typeof payments)[number];
    const signed = (p: P) => (p.direction === "REFUND" ? -p.amount : p.amount);
    const verified = payments.filter((p) => p.status === "VERIFIED");
    const received = verified.filter((p) => p.direction === "COLLECTION").reduce((sum, p) => sum + p.amount, 0);
    const refunded = verified.filter((p) => p.direction === "REFUND").reduce((sum, p) => sum + p.amount, 0);
    const awaiting = payments.filter((p) => p.status === "PENDING").reduce((sum, p) => sum + signed(p), 0);

    const byMethod = new Map<string, number>();
    for (const p of verified) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + signed(p));
    const methodLabel = (m: string) => m.replace("_", " ").toLowerCase();

    return {
      name: "daybook",
      title: REPORT_INFO.daybook.title,
      period: { from: range.from, to: range.to },
      summary: [
        { label: "Received", value: received, kind: "money" },
        { label: "Refunded", value: refunded, kind: "money" },
        { label: "Net (verified)", value: received - refunded, kind: "money" },
        { label: "Awaiting verification", value: awaiting, kind: "money" },
        ...[...byMethod.entries()].map(([method, amount]) => ({ label: `via ${methodLabel(method)}`, value: amount, kind: "money" as const })),
      ],
      columns: [
        { key: "date", label: "Date", kind: "date" },
        { key: "receiptNo", label: "Receipt", kind: "text" },
        { key: "booking", label: "Booking", kind: "text" },
        { key: "customer", label: "Customer", kind: "text" },
        { key: "method", label: "Method", kind: "text" },
        { key: "type", label: "Type", kind: "text" },
        { key: "amount", label: "Amount", kind: "money" },
        { key: "status", label: "Status", kind: "text" },
        { key: "recordedBy", label: "Recorded by", kind: "text" },
      ],
      rows: payments.map((p) => ({
        date: toDateOnly(p.createdAt),
        receiptNo: p.receiptNo,
        booking: p.booking.refNo,
        customer: p.booking.customer.fullName,
        method: methodLabel(p.method),
        type: p.direction === "REFUND" ? "Refund" : "Payment",
        amount: signed(p),
        status: p.status.toLowerCase(),
        recordedBy: (p.recordedById && users.get(p.recordedById)?.name) || "—",
      })),
    };
  }

  // ─── Lead sources ─────────────────────────────────────────────────────────

  private async leadSources(actor: RequestUser, range: Range): Promise<ReportResult> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", "Lead")) throw AppError.forbidden();

    const leads = await this.prisma.lead.findMany({
      where: { AND: [accessibleBy(ability).Lead, { createdAt: { gte: range.gte, lte: range.lte } }] },
      select: { source: true, stage: true },
    });

    const bySource = new Map<LeadSource, { total: number; won: number; lost: number }>();
    for (const lead of leads) {
      const row = bySource.get(lead.source) ?? { total: 0, won: 0, lost: 0 };
      row.total++;
      if (lead.stage === "WON") row.won++;
      if (lead.stage === "LOST") row.lost++;
      bySource.set(lead.source, row);
    }
    const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
    const rows = [...bySource.entries()]
      .map(([source, v]) => ({ source: LEAD_SOURCE_LABELS[source], total: v.total, open: v.total - v.won - v.lost, won: v.won, lost: v.lost, conversion: percent(v.won, v.total) }))
      .sort((a, b) => b.total - a.total);
    const won = rows.reduce((sum, row) => sum + row.won, 0);

    return {
      name: "lead-sources",
      title: REPORT_INFO["lead-sources"].title,
      period: { from: range.from, to: range.to },
      summary: [
        { label: "Leads", value: leads.length, kind: "number" },
        { label: "Won", value: won, kind: "number" },
        { label: "Conversion", value: percent(won, leads.length), kind: "percent" },
      ],
      columns: [
        { key: "source", label: "Source", kind: "text" },
        { key: "total", label: "Leads", kind: "number" },
        { key: "open", label: "Open", kind: "number" },
        { key: "won", label: "Won", kind: "number" },
        { key: "lost", label: "Lost", kind: "number" },
        { key: "conversion", label: "Conversion", kind: "percent" },
      ],
      rows,
    };
  }

  // ─── Staff performance (managers only) ────────────────────────────────────

  private async staffPerformance(actor: RequestUser, range: Range): Promise<ReportResult> {
    if (!this.abilities.forUser(actor).can("manage", "Booking")) throw AppError.forbidden();

    const period = { gte: range.gte, lte: range.lte };
    const sold: Prisma.BookingWhereInput = { status: { notIn: ["CANCELLED", "FAILED", "INQUIRY"] } };
    const [staff, created, won, bookings, tasks] = await Promise.all([
      this.prisma.user.findMany({ where: { type: "STAFF", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.lead.groupBy({ by: ["ownerId"], where: { createdAt: period, ownerId: { not: null } }, _count: true }),
      this.prisma.lead.groupBy({ by: ["ownerId"], where: { stage: "WON", stageChangedAt: period, ownerId: { not: null } }, _count: true }),
      this.prisma.booking.groupBy({ by: ["ownerId"], where: { ...sold, createdAt: period, ownerId: { not: null } }, _count: true, _sum: { totalSell: true } }),
      this.prisma.task.groupBy({ by: ["assigneeId"], where: { status: "DONE", completedAt: period }, _count: true }),
    ]);

    const rows = staff
      .map((user) => {
        const booking = bookings.find((b) => b.ownerId === user.id);
        return {
          name: user.name,
          leads: created.find((l) => l.ownerId === user.id)?._count ?? 0,
          won: won.find((l) => l.ownerId === user.id)?._count ?? 0,
          bookings: booking?._count ?? 0,
          sales: booking?._sum.totalSell ?? 0,
          tasksDone: tasks.find((t) => t.assigneeId === user.id)?._count ?? 0,
        };
      })
      .sort((a, b) => b.sales - a.sales);

    return {
      name: "staff-performance",
      title: REPORT_INFO["staff-performance"].title,
      period: { from: range.from, to: range.to },
      summary: [
        { label: "Leads created", value: rows.reduce((sum, r) => sum + r.leads, 0), kind: "number" },
        { label: "Leads won", value: rows.reduce((sum, r) => sum + r.won, 0), kind: "number" },
        { label: "Sales value", value: rows.reduce((sum, r) => sum + r.sales, 0), kind: "money" },
      ],
      columns: [
        { key: "name", label: "Team member", kind: "text" },
        { key: "leads", label: "Leads", kind: "number" },
        { key: "won", label: "Won", kind: "number" },
        { key: "bookings", label: "Bookings", kind: "number" },
        { key: "sales", label: "Sales value", kind: "money" },
        { key: "tasksDone", label: "Tasks done", kind: "number" },
      ],
      rows,
    };
  }
}
