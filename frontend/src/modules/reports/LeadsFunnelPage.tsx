import { REPORT_INFO } from "@mashkoor/shared";
import { useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { Card } from "@/core/ui/layout";
import { useReport } from "./api";
import { FunnelBars } from "./charts";
import { ReportShell, rangeFromParams } from "./shared";

export function LeadsFunnelPage() {
  const [params, setParams] = useSearchParams();
  const { from, to } = rangeFromParams(params);
  const { data, isLoading, error } = useReport("leads-funnel", from, to);
  const info = REPORT_INFO["leads-funnel"];

  const stages = data?.rows.filter((r) => r.stageKey !== "LOST") ?? [];
  const lost = data?.rows.find((r) => r.stageKey === "LOST");

  return (
    <ReportShell title={info.title} description={info.description} pointInTime={false} from={from} to={to} onRangeChange={(f, t) => setParams({ from: f, to: t })} data={data} isLoading={isLoading} error={error ? errorMessage(error) : null}>
      <Card className="p-5">
        <FunnelBars stages={stages.map((s) => ({ label: String(s.stage), value: Number(s.reached), percent: Number(s.percent) }))} />
        {lost && (
          <p className="mt-4 border-t border-line pt-3 text-sm text-ink-500">
            Separately, <span className="font-semibold text-red-600">{lost.reached} lost</span> ({lost.percent}% of leads created this period) — not part of the funnel above since they dropped out along the way.
          </p>
        )}
        {data && data.rows.length === 0 && <p className="py-10 text-center text-sm text-ink-500">No leads created in this period.</p>}
      </Card>
    </ReportShell>
  );
}
