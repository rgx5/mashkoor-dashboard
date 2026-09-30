import { BOOKING_STATUS_LABELS, REPORT_INFO, type BookingStatus } from "@mashkoor/shared";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Badge, Card } from "@/core/ui/layout";
import { useReport } from "./api";
import { TrendBars } from "./charts";
import { ReportShell, bucketByDate } from "./shared";

const statusTone = (label: string) => {
  const entry = Object.entries(BOOKING_STATUS_LABELS).find(([, l]) => l === label)?.[0] as BookingStatus | undefined;
  return entry === "CONFIRMED" || entry === "COMPLETED" ? "green" : entry === "CANCELLED" || entry === "FAILED" ? "red" : "plum";
};

export function SalesRegisterPage() {
  const [params, setParams] = useSearchParams();
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const { data, isLoading, error } = useReport("sales", from, to);
  const info = REPORT_INFO.sales;
  const trend = data ? bucketByDate(data.rows, "date", "sell") : [];
  const showCost = data?.columns.some((c) => c.key === "cost") ?? false;

  return (
    <ReportShell title={info.title} description={info.description} pointInTime={false} from={from} to={to} onRangeChange={(f, t) => setParams({ from: f, to: t })} data={data} isLoading={isLoading} error={error ? errorMessage(error) : null}>
      <Card className="mb-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink-700">Sales value by day</h3>
        <TrendBars data={trend} />
      </Card>
      {data && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Booking</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Trip</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 text-right font-semibold">Sell price</th>
                  {showCost && <th className="px-4 py-3 text-right font-semibold">Cost</th>}
                  {showCost && <th className="px-4 py-3 text-right font-semibold">Margin</th>}
                  <th className="px-4 py-3 text-right font-semibold">Collected</th>
                  <th className="px-4 py-3 text-right font-semibold">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-plum-50/40">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(String(r.date))}</td>
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
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-500">{r.type}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(String(r.status))}>{String(r.status)}</Badge>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-ink-500">{r.owner}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(Number(r.sell))}</td>
                    {showCost && <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">{formatINR(Number(r.cost))}</td>}
                    {showCost && <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(Number(r.margin))}</td>}
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(Number(r.collected))}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${Number(r.due) > 0 ? "text-red-600" : ""}`}>{formatINR(Number(r.due))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-500">No bookings sold in this period.</p>}
          {data.rows.length > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-500">{data.rows.length} booking(s)</p>}
        </Card>
      )}
    </ReportShell>
  );
}
