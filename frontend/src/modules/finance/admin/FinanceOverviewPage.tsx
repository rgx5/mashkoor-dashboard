import { LEDGER_KIND_LABELS, PAYMENT_METHOD_LABELS } from "@mashkoor/shared";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Hourglass, Plus, Scale } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Card, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { CHART_COLORS, RankedBarList } from "@/modules/reports/charts";
import { useFinanceOverview } from "../api";
import { RecordEntryDialog, type EntryPreset } from "./EntryDialogs";
import { defaultRange, RangeBar } from "./parts";

const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
const shortINR = (v: number) => (Math.abs(v) >= 100000 ? `₹${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L` : Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`);

/** Every calendar day in the range, with zeros where nothing moved, so the bars sit on a true timeline. Long ranges just use the days that have data. */
function fillDays(from: string, to: string, daily: { date: string; in: number; out: number }[]) {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const dates = days <= 62 ? Array.from({ length: days }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)) : daily.map((d) => d.date);
  return dates.map((date) => ({ date, label: dayFmt.format(new Date(`${date}T00:00:00+05:30`)), in: byDate.get(date)?.in ?? 0, out: byDate.get(date)?.out ?? 0 }));
}

function Tile({ label, value, tone, icon: Icon, hint, to }: { label: string; value: string; tone: "in" | "out" | "net" | "warn"; icon: typeof Plus; hint?: string; to?: string }) {
  const tones = { in: "bg-emerald-50 text-emerald-700", out: "bg-red-50 text-red-600", net: "bg-plum-50 text-plum-700", warn: "bg-gold-50 text-gold-700" };
  const body = (
    <Card className={cn("flex items-start gap-3 p-4", to && "transition hover:border-plum-300")}>
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-ink-900 tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function FinanceOverviewPage() {
  const ability = useAbility("admin");
  const [params, setParams] = useSearchParams();
  const fallback = defaultRange();
  const from = params.get("from") ?? fallback.from;
  const to = params.get("to") ?? fallback.to;
  const { data, isLoading, error } = useFinanceOverview({ from, to });
  const [recording, setRecording] = useState<EntryPreset | null>(null);

  const setRange = (f: string, t: string) => setParams({ from: f, to: t });
  const ledgerLink = (extra = "") => `/admin/accounts/ledger?from=${from}&to=${to}${extra}`;

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every rupee in and out"
        actions={
          ability.can("create", "FinanceEntry") && (
            <>
              <Button variant="secondary" onClick={() => setRecording({ direction: "IN" })}>
                <Plus className="h-4 w-4" aria-hidden /> Money in
              </Button>
              <Button onClick={() => setRecording({ direction: "OUT" })}>
                <Plus className="h-4 w-4" aria-hidden /> Money out
              </Button>
            </>
          )
        }
      >
        <RangeBar from={from} to={to} onChange={setRange} />
      </PageHeader>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {error && <p className="py-10 text-center text-sm text-red-600">{errorMessage(error)}</p>}

      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Money in" value={formatINR(data.totals.in)} tone="in" icon={ArrowDownLeft} hint={`${formatDate(data.period.from)} – ${formatDate(data.period.to)}`} to={ledgerLink("&direction=IN")} />
            <Tile label="Money out" value={formatINR(data.totals.out)} tone="out" icon={ArrowUpRight} hint="Suppliers, refunds and expenses" to={ledgerLink("&direction=OUT")} />
            <Tile label="Net" value={formatINR(data.totals.net)} tone="net" icon={Scale} hint={`${data.totals.count} entries`} to={ledgerLink()} />
            <Tile
              label="Awaiting verification"
              value={formatINR(data.awaitingVerification.amount)}
              tone="warn"
              icon={Hourglass}
              hint={data.awaitingVerification.count === 0 ? "Nothing waiting" : `${data.awaitingVerification.count} customer payment${data.awaitingVerification.count > 1 ? "s" : ""} not counted yet`}
              to="/admin/payments"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-3 text-base font-semibold">Day by day</h2>
              {data.daily.length === 0 ? (
                <p className="py-12 text-center text-sm text-ink-500">No money moved in this period.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fillDays(data.period.from, data.period.to, data.daily)} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} tickFormatter={shortINR} width={48} />
                      <Tooltip formatter={(v, name) => [formatINR(Number(v)), name === "in" ? "Money in" : "Money out"]} labelStyle={{ fontWeight: 600 }} cursor={{ fill: "rgba(122,26,94,0.05)" }} />
                      <Bar dataKey="in" fill={CHART_COLORS.emerald} radius={[3, 3, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="out" fill={CHART_COLORS.red} radius={[3, 3, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="mt-2 flex gap-4 text-xs text-ink-500">
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.emerald }} /> Money in
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS.red }} /> Money out
                </span>
              </p>
            </Card>

            <div className="space-y-4">
              <Card className="p-5">
                <h2 className="text-base font-semibold">Customers owe us</h2>
                <p className="mt-1 text-2xl font-bold text-ink-900 tabular-nums">{formatINR(data.receivables.amount)}</p>
                <p className="text-xs text-ink-500">across {data.receivables.bookings} booking{data.receivables.bookings === 1 ? "" : "s"}</p>
                <Link to="/admin/accounts/bookings?show=owing" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-plum-700 hover:underline">
                  See which <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Card>
              <Card className="p-5">
                <h2 className="text-base font-semibold">We owe suppliers</h2>
                <p className="mt-1 text-2xl font-bold text-ink-900 tabular-nums">{formatINR(data.payables.amount)}</p>
                <p className="text-xs text-ink-500">
                  {data.payables.bookings === 0 ? "No booking costs are outstanding" : `across ${data.payables.bookings} booking${data.payables.bookings === 1 ? "" : "s"}, against the costs entered on them`}
                </p>
                <Link to="/admin/accounts/bookings?show=supplier-due" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-plum-700 hover:underline">
                  See which <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-1 text-base font-semibold">Money in, by source</h2>
              <p className="mb-3 text-xs text-ink-500">{formatINR(data.totals.in)}</p>
              <RankedBarList valueLabel="Money in" formatter={formatINR} items={data.inByKind.map((k) => ({ label: LEDGER_KIND_LABELS[k.kind], value: k.amount }))} />
            </Card>
            <Card className="p-5">
              <h2 className="mb-1 text-base font-semibold">Money out, by category</h2>
              <p className="mb-3 text-xs text-ink-500">{formatINR(data.totals.out)}</p>
              <RankedBarList valueLabel="Money out" formatter={formatINR} items={data.outByKind.map((k) => ({ label: LEDGER_KIND_LABELS[k.kind], value: k.amount }))} />
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold">Where the money is</h2>
              <p className="text-xs text-ink-500">What each cash box and account should hold at the end of {formatDate(data.period.to)}, counted from the first entry on record.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Method
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      In
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      Out
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      Should hold
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.balances.map((m) => (
                    <tr key={m.method}>
                      <td className="px-5 py-2.5 font-medium">
                        {PAYMENT_METHOD_LABELS[m.method]}
                        {m.method === "OTHER" && <span className="ml-1.5 text-xs font-normal text-ink-500">(incl. partner wallet top-ups)</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-emerald-700">{formatINR(m.in)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-red-600">{formatINR(m.out)}</td>
                      <td className={cn("px-5 py-2.5 text-right font-semibold tabular-nums", m.net < 0 && "text-red-600")}>{formatINR(m.net)}</td>
                    </tr>
                  ))}
                  {data.balances.length > 0 && (
                    <tr className="bg-surface/60 font-semibold">
                      <td className="px-5 py-2.5">Total</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{formatINR(data.balances.reduce((n, m) => n + m.in, 0))}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{formatINR(data.balances.reduce((n, m) => n + m.out, 0))}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{formatINR(data.balances.reduce((n, m) => n + m.net, 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.balances.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink-500">Nothing recorded yet.</p>}
          </Card>
        </div>
      )}

      <RecordEntryDialog open={Boolean(recording)} onClose={() => setRecording(null)} preset={recording ?? undefined} />
    </>
  );
}
