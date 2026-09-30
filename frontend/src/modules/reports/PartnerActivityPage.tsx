import { REPORT_INFO } from "@mashkoor/shared";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { Badge, Card } from "@/core/ui/layout";
import { useReport } from "./api";
import { RankedBarList } from "./charts";
import { ReportShell, rangeFromParams } from "./shared";

export function PartnerActivityPage() {
  const [params, setParams] = useSearchParams();
  const { from, to } = rangeFromParams(params);
  const { data, isLoading, error } = useReport("partner-activity", from, to);
  const info = REPORT_INFO["partner-activity"];

  return (
    <ReportShell title={info.title} description={info.description} pointInTime={false} from={from} to={to} onRangeChange={(f, t) => setParams({ from: f, to: t })} data={data} isLoading={isLoading} error={error ? errorMessage(error) : null}>
      <Card className="mb-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink-700">Ranked by sales value</h3>
        <RankedBarList
          valueLabel="sales value"
          formatter={(v) => formatINR(v)}
          items={(data?.rows ?? []).map((r) => ({ label: String(r.partner), value: Number(r.sales), href: `/admin/partners/${r.partnerId}` }))}
        />
      </Card>
      {data && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Partner</th>
                  <th className="px-4 py-3 text-right font-semibold">Leads</th>
                  <th className="px-4 py-3 text-right font-semibold">Bookings</th>
                  <th className="px-4 py-3 text-right font-semibold">Sales value</th>
                  <th className="px-4 py-3 font-semibold">Wallet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r) => {
                  const balance = Number(r.balance);
                  const creditLimit = Number(r.creditLimit);
                  return (
                    <tr key={String(r.partnerId)} className="hover:bg-plum-50/40">
                      <td className="px-4 py-2.5">
                        <Link to={`/admin/partners/${r.partnerId}`} className="font-semibold text-plum-700 hover:underline">
                          {r.partner}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.leads}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.bookings}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(Number(r.sales))}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={balance < 0 ? "red" : "green"}>{formatINR(balance)}</Badge>
                        {creditLimit > 0 && <span className="ml-2 text-xs text-ink-500">of {formatINR(creditLimit)} limit</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-500">No approved partners yet.</p>}
        </Card>
      )}
    </ReportShell>
  );
}
