import { REPORT_INFO } from "@mashkoor/shared";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Card } from "@/core/ui/layout";
import { useReport } from "./api";
import { AgeingBuckets } from "./charts";
import { ReportShell, rangeFromParams } from "./shared";

const BUCKET_ORDER = ["0–30 days", "31–60 days", "61–90 days", "90+ days"];

export function AgeingPage() {
  const [params] = useSearchParams();
  const { from, to } = rangeFromParams(params);
  const { data, isLoading, error } = useReport("ageing", from, to);
  const info = REPORT_INFO.ageing;

  const totals = new Map(BUCKET_ORDER.map((b) => [b, 0]));
  for (const r of data?.rows ?? []) totals.set(String(r.bucket), (totals.get(String(r.bucket)) ?? 0) + Number(r.due));

  return (
    <ReportShell title={info.title} description={info.description} pointInTime data={data} isLoading={isLoading} error={error ? errorMessage(error) : null} onRangeChange={() => {}} from={from} to={to}>
      <div className="mb-5">
        <AgeingBuckets buckets={BUCKET_ORDER.map((label) => ({ label, value: totals.get(label) ?? 0 }))} />
      </div>
      {data && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Booking</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Mobile</th>
                  <th className="px-4 py-3 font-semibold">Departure</th>
                  <th className="px-4 py-3 text-right font-semibold">Due</th>
                  <th className="px-4 py-3 text-right font-semibold">Age (days)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-plum-50/40">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/bookings/${r.bookingId}`} className="font-semibold text-plum-700 hover:underline">
                        {r.refNo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/customers/${r.customerId}`} className="text-ink-700 hover:underline">
                        {r.customer}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-500">{r.phone}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(String(r.travelFrom))}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-red-600">{formatINR(Number(r.due))}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${Number(r.ageDays) > 90 ? "font-semibold text-red-600" : "text-ink-700"}`}>{r.ageDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-500">Nothing outstanding right now.</p>}
          {data.rows.length > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-500">{data.rows.length} booking(s)</p>}
        </Card>
      )}
    </ReportShell>
  );
}
