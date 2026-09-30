import type { ReportResult, ReportValueKind } from "@mashkoor/shared";
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { formatDate, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { inputClass } from "@/core/ui/form";
import { Card, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "Today", range: () => [iso(new Date()), iso(new Date())] },
  { label: "This month", range: () => [`${iso(new Date()).slice(0, 8)}01`, iso(new Date())] },
  { label: "Last 30 days", range: () => [iso(new Date(Date.now() - 29 * 86400_000)), iso(new Date())] },
  { label: "This year", range: () => [`${new Date().getFullYear()}-01-01`, iso(new Date())] },
];

export function formatValue(value: string | number | null, kind: ReportValueKind): string {
  if (value === null || value === "") return "—";
  switch (kind) {
    case "money":
      return formatINR(Number(value));
    case "date":
      return formatDate(String(value));
    case "percent":
      return `${value}%`;
    case "number":
      return Number(value).toLocaleString("en-IN");
    default:
      return String(value);
  }
}

/** Client-side CSV so the download uses the same data already on screen (and the same access checks). */
export function downloadCsv(report: ReportResult) {
  const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [report.columns.map((c) => cell(c.label)).join(","), ...report.rows.map((row) => report.columns.map((c) => cell(row[c.key] ?? null)).join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.name}-${report.period.from}-to-${report.period.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Header + date range + summary tiles shared by every report page; the body (chart, table) is the report-specific part. */
export function ReportShell({
  title,
  description,
  pointInTime,
  from,
  to,
  onRangeChange,
  data,
  isLoading,
  error,
  children,
}: {
  title: string;
  description: string;
  pointInTime: boolean;
  from?: string;
  to?: string;
  onRangeChange: (from: string, to: string) => void;
  data?: ReportResult;
  isLoading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          data && (
            <Button variant="secondary" onClick={() => downloadCsv(data)} disabled={data.rows.length === 0}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
          )
        }
      />

      {!pointInTime && (
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-ink-500">
            From
            <input type="date" value={data?.period.from ?? from ?? ""} max={data?.period.to} onChange={(e) => onRangeChange(e.target.value, data?.period.to ?? e.target.value)} className={`${inputClass} mt-1 w-40`} />
          </label>
          <label className="text-xs font-semibold text-ink-500">
            To
            <input type="date" value={data?.period.to ?? to ?? ""} min={data?.period.from} onChange={(e) => onRangeChange(data?.period.from ?? e.target.value, e.target.value)} className={`${inputClass} mt-1 w-40`} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => onRangeChange(...p.range())} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-plum-300 hover:text-plum-700">
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {error && <p className="py-10 text-center text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <ReportSummaryTiles data={data} />
          {children}
        </>
      )}
    </>
  );
}

export function ReportSummaryTiles({ data }: { data: ReportResult }) {
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.summary.map((s) => (
        <Card key={s.label} className="p-4">
          <p className="text-xs font-semibold text-ink-500 capitalize">{s.label}</p>
          <p className="mt-1 text-xl font-bold text-ink-900">{formatValue(s.value, s.kind)}</p>
        </Card>
      ))}
    </div>
  );
}

/** The plain data table, for reports that still want the row-level detail below their chart. */
export function ReportTable({ data, emptyLabel = "Nothing to report for this period" }: { data: ReportResult; emptyLabel?: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
            <tr>
              {data.columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 font-semibold whitespace-nowrap", (c.kind === "money" || c.kind === "number" || c.kind === "percent") && "text-right")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.rows.map((row, i) => (
              <tr key={i} className="hover:bg-plum-50/40">
                {data.columns.map((c) => {
                  const value = row[c.key] ?? null;
                  return (
                    <td key={c.key} className={cn("px-4 py-2.5 whitespace-nowrap", (c.kind === "money" || c.kind === "number" || c.kind === "percent") && "text-right tabular-nums", c.kind === "money" && Number(value) < 0 && "text-red-600")}>
                      {formatValue(value, c.kind)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-500">{emptyLabel}</p>}
      {data.rows.length > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-500">{data.rows.length} row(s)</p>}
    </Card>
  );
}

/** `useSearchParams`-backed from/to, shared by every non-point-in-time report page. */
export function rangeFromParams(params: URLSearchParams) {
  return { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined };
}

const dayLabelFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

/** Sums a numeric row field per calendar day, for a trend chart — the report itself stays row-level. */
export function bucketByDate(rows: Record<string, string | number | null>[], dateKey: string, valueKey: string): { date: string; value: number; label: string }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const date = row[dateKey];
    if (typeof date !== "string") continue;
    totals.set(date, (totals.get(date) ?? 0) + (Number(row[valueKey]) || 0));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: dayLabelFmt.format(new Date(`${date}T00:00:00+05:30`)), value, label: dayLabelFmt.format(new Date(`${date}T00:00:00+05:30`)) }));
}
