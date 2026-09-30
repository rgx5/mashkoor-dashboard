import { REPORT_INFO, REPORT_NAMES, type ReportName, type ReportResult, type ReportValueKind } from "@mashkoor/shared";
import { AlertTriangle, BarChart3, Download } from "lucide-react";
import { useParams, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { inputClass } from "@/core/ui/form";
import { Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useReport } from "./api";

const isReport = (name: string | undefined): name is ReportName => (REPORT_NAMES as readonly string[]).includes(name ?? "");

const iso = (d: Date) => d.toISOString().slice(0, 10);
const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "Today", range: () => [iso(new Date()), iso(new Date())] },
  { label: "This month", range: () => [`${iso(new Date()).slice(0, 8)}01`, iso(new Date())] },
  { label: "Last 30 days", range: () => [iso(new Date(Date.now() - 29 * 86400_000)), iso(new Date())] },
  { label: "This year", range: () => [`${new Date().getFullYear()}-01-01`, iso(new Date())] },
];

function format(value: string | number | null, kind: ReportValueKind): string {
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
function downloadCsv(report: ReportResult) {
  const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [report.columns.map((c) => cell(c.label)).join(","), ...report.rows.map((row) => report.columns.map((c) => cell(row[c.key] ?? null)).join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.name}-${report.period.from}-to-${report.period.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportPage() {
  const { name } = useParams();
  if (!isReport(name)) return <EmptyState icon={AlertTriangle} title="Unknown report" />;
  return <Report name={name} />;
}

function Report({ name }: { name: ReportName }) {
  const [params, setParams] = useSearchParams();
  const pointInTime = name === "ageing" || name === "upcoming-travel";
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const { data, isLoading, error } = useReport(name, from, to);
  const info = REPORT_INFO[name];

  const setRange = (f: string, t: string) => setParams({ from: f, to: t });

  return (
    <>
      <PageHeader
        title={info.title}
        description={info.description}
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
            <input type="date" value={data?.period.from ?? from ?? ""} max={data?.period.to} onChange={(e) => setRange(e.target.value, data?.period.to ?? e.target.value)} className={`${inputClass} mt-1 w-40`} />
          </label>
          <label className="text-xs font-semibold text-ink-500">
            To
            <input type="date" value={data?.period.to ?? to ?? ""} min={data?.period.from} onChange={(e) => setRange(data?.period.from ?? e.target.value, e.target.value)} className={`${inputClass} mt-1 w-40`} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => setRange(...p.range())} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-plum-300 hover:text-plum-700">
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
      {error && <p className="py-10 text-center text-sm text-red-600">{errorMessage(error, "Unable to run this report")}</p>}

      {data && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.summary.map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-xs font-semibold text-ink-500 capitalize">{s.label}</p>
                <p className="mt-1 text-xl font-bold text-ink-900">{format(s.value, s.kind)}</p>
              </Card>
            ))}
          </div>

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
                            {format(value, c.kind)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.rows.length === 0 && <EmptyState icon={BarChart3} title="Nothing to report for this period" />}
            {data.rows.length > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-500">{data.rows.length} row(s)</p>}
          </Card>
        </>
      )}
    </>
  );
}
