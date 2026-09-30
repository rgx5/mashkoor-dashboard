import { REPORT_INFO } from "@mashkoor/shared";
import { useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { Card } from "@/core/ui/layout";
import { useReport } from "./api";
import { RankedBarList } from "./charts";
import { ReportShell, ReportTable, rangeFromParams } from "./shared";

export function StaffPerformancePage() {
  const [params, setParams] = useSearchParams();
  const { from, to } = rangeFromParams(params);
  const { data, isLoading, error } = useReport("staff-performance", from, to);
  const info = REPORT_INFO["staff-performance"];

  return (
    <ReportShell title={info.title} description={info.description} pointInTime={false} from={from} to={to} onRangeChange={(f, t) => setParams({ from: f, to: t })} data={data} isLoading={isLoading} error={error ? errorMessage(error) : null}>
      <Card className="mb-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink-700">Ranked by sales value</h3>
        <RankedBarList valueLabel="sales value" formatter={(v) => formatINR(v)} items={(data?.rows ?? []).map((r) => ({ label: String(r.name), value: Number(r.sales) }))} />
      </Card>
      {data && <ReportTable data={data} />}
    </ReportShell>
  );
}
