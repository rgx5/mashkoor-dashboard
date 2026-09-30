import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router";
import { formatINR } from "@/core/format";
import { Card } from "@/core/ui/layout";

/** Mirrors the brand tokens in styles.css — recharts needs resolved colors, not CSS custom properties. */
export const CHART_COLORS = {
  plum: "#7a1a5e",
  plumLight: "#d093b9",
  gold: "#e3ac0c",
  emerald: "#059669",
  red: "#dc2626",
  grid: "#e8e3ea",
  axis: "#a89da8",
};

const tooltipStyle = { background: "white", border: "1px solid var(--color-line)", borderRadius: 10, boxShadow: "0 4px 16px rgba(30,19,32,0.08)", fontSize: 12 };

/** A ranked, single-series horizontal bar list — for "who/what leads by this number" (sources, staff, partners). */
export function RankedBarList({
  items,
  valueLabel,
  formatter = (v: number) => v.toLocaleString("en-IN"),
}: {
  items: { label: string; value: number; href?: string }[];
  valueLabel: string;
  formatter?: (v: number) => string;
}) {
  if (items.length === 0) return <p className="py-10 text-center text-sm text-ink-500">Nothing to show for this period.</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const label = item.href ? (
          <Link to={item.href} className="truncate font-medium text-plum-700 hover:underline" title={item.label}>
            {item.label}
          </Link>
        ) : (
          <span className="truncate font-medium text-ink-700" title={item.label}>
            {item.label}
          </span>
        );
        return (
          <div key={item.label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_auto]">
            {label}
            <div className="h-2.5 overflow-hidden rounded-full bg-plum-50">
              <div className="h-full rounded-full bg-plum-600" style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0)}%` }} />
            </div>
            <span className="tabular-nums font-semibold text-ink-900" aria-label={valueLabel}>
              {formatter(item.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A narrowing sequence of stages, each shaded a step darker — for a funnel where every stage is a subset of the last. */
export function FunnelBars({ stages }: { stages: { label: string; value: number; percent: number }[] }) {
  if (stages.length === 0) return null;
  const max = Math.max(...stages.map((s) => s.value), 1);
  const shades = ["#f3e1ec", "#e6c1d8", "#d093b9", "#b25e93", "#943a76", "#7a1a5e"];
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-sm font-medium text-ink-700">{s.label}</span>
          <div className="h-8 flex-1 overflow-hidden rounded-lg bg-plum-50">
            <div
              className="flex h-full items-center rounded-lg px-3 text-xs font-semibold text-white transition-all"
              style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 6 : 0)}%`, background: shades[Math.min(i, shades.length - 1)] }}
            >
              {s.value > 0 && s.value}
            </div>
          </div>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-500">{s.percent}%</span>
        </div>
      ))}
    </div>
  );
}

/** Caps the number of x-axis labels shown regardless of how many days are in range, so ticks never overlap. */
const tickInterval = (n: number) => Math.max(0, Math.ceil(n / 8) - 1);

/** Daily bars, positive (collected) vs negative (refunded/overdue) shaded by direction — a diverging pair around zero. */
export function DivergingDayBars({ data }: { data: { date: string; value: number; label: string }[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-ink-500">No activity in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="date" interval={tickInterval(data.length)} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} width={70} tickFormatter={(v: number) => formatINR(v)} />
        <Tooltip
          cursor={{ fill: "rgba(122,26,94,0.05)" }}
          contentStyle={tooltipStyle}
          formatter={(value: unknown) => [formatINR(Number(value)), "Net"]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
        />
        <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={28}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? CHART_COLORS.emerald : CHART_COLORS.red} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Simple single-hue trend bars over time. */
export function TrendBars({ data }: { data: { date: string; value: number; label: string }[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-sm text-ink-500">No activity in this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="date" interval={tickInterval(data.length)} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} width={70} tickFormatter={(v: number) => formatINR(v)} />
        <Tooltip cursor={{ fill: "rgba(122,26,94,0.05)" }} contentStyle={tooltipStyle} formatter={(value: unknown) => [formatINR(Number(value)), "Sales"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""} />
        <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={28} fill={CHART_COLORS.plum} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Four fixed ageing buckets shaded light-to-dark by how overdue they are — a sequential ramp, not a category palette. */
export function AgeingBuckets({ buckets }: { buckets: { label: string; value: number }[] }) {
  const shades = ["#fef1c7", "#fad25a", "#f87171", "#dc2626"];
  const max = Math.max(...buckets.map((b) => b.value), 1);
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {buckets.map((b, i) => (
        <Card key={b.label} className="p-4">
          <p className="text-xs font-semibold text-ink-500">{b.label}</p>
          <p className="mt-1 text-lg font-bold text-ink-900">{formatINR(b.value)}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full" style={{ width: `${Math.max((b.value / max) * 100, b.value > 0 ? 4 : 0)}%`, background: shades[i] }} />
          </div>
        </Card>
      ))}
    </div>
  );
}
