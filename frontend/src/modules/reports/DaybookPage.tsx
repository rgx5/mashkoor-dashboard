import { REPORT_INFO } from "@mashkoor/shared";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Badge, Card } from "@/core/ui/layout";
import { useReport } from "./api";
import { DivergingDayBars } from "./charts";
import { ReportShell, bucketByDate, rangeFromParams } from "./shared";

type Row = Record<string, string | number | null>;

function groupByDate(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const date = String(row.date);
    groups.set(date, [...(groups.get(date) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export function DaybookPage() {
  const [params, setParams] = useSearchParams();
  const { from, to } = rangeFromParams(params);
  const { data, isLoading, error } = useReport("daybook", from, to);
  const info = REPORT_INFO.daybook;
  const trend = data ? bucketByDate(data.rows, "date", "amount") : [];

  return (
    <ReportShell title={info.title} description={info.description} pointInTime={false} from={from} to={to} onRangeChange={(f, t) => setParams({ from: f, to: t })} data={data} isLoading={isLoading} error={error ? errorMessage(error) : null}>
      <Card className="mb-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink-700">Net cash by day</h3>
        <DivergingDayBars data={trend} />
      </Card>
      {data && data.rows.length === 0 && (
        <Card className="p-10 text-center text-sm text-ink-500">No payments recorded in this period.</Card>
      )}
      <div className="space-y-4">
        {data &&
          groupByDate(data.rows).map(([date, rows]) => {
            const net = rows.reduce((sum, r) => sum + Number(r.amount), 0);
            return (
              <Card key={date} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line bg-surface/60 px-4 py-2.5">
                  <p className="text-sm font-semibold text-ink-700">{formatDate(date)}</p>
                  <p className={`text-sm font-bold tabular-nums ${net < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatINR(net)}</p>
                </div>
                <div className="divide-y divide-line">
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link to={`/admin/bookings/${r.bookingId}`} className="font-semibold text-plum-700 hover:underline">
                          {r.receiptNo}
                        </Link>
                        <span className="ml-2 text-ink-500">
                          {r.booking} · {r.customer}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-ink-500 capitalize">
                          {r.method} · {r.recordedBy}
                        </span>
                        <Badge tone={r.status === "verified" ? "green" : r.status === "pending" ? "amber" : "red"}>{String(r.status)}</Badge>
                        <span className={`w-24 text-right font-semibold tabular-nums ${Number(r.amount) < 0 ? "text-red-600" : "text-ink-900"}`}>{formatINR(Number(r.amount))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
      </div>
    </ReportShell>
  );
}
