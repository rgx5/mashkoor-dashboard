import { REPORT_INFO } from "@mashkoor/shared";
import { useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { Card } from "@/core/ui/layout";
import { useReport } from "./api";
import { RankedBarList } from "./charts";
import { ReportShell, ReportTable, rangeFromParams } from "./shared";

export function LeadSourcesPage() {
  const [params, setParams] = useSearchParams();
  const { from, to } = rangeFromParams(params);
  const { data, isLoading, error } = useReport("lead-sources", from, to);
  const info = REPORT_INFO["lead-sources"];

  return (
    <ReportShell title={info.title} description={info.description} pointInTime={false} from={from} to={to} onRangeChange={(f, t) => setParams({ from: f, to: t })} data={data} isLoading={isLoading} error={error ? errorMessage(error) : null}>
      <Card className="mb-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink-700">Leads by source</h3>
        <RankedBarList
          valueLabel="leads"
          items={(data?.rows ?? []).map((r) => ({ label: String(r.source), value: Number(r.total), href: `/admin/leads?source=${r.sourceKey}` }))}
        />
      </Card>
      {data && <ReportTable data={data} />}
    </ReportShell>
  );
}
