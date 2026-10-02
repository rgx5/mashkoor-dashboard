import { INBOUND_CHANNELS, INBOUND_STATUSES, type InboundChannel, type InboundEventRow, type InboundStatus } from "@mashkoor/shared";
import { Inbox, RotateCw } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatDateTime } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useInboundEvents, useReplayInboundEvent } from "../api";

const CHANNEL_LABELS: Record<InboundChannel, string> = { WEBSITE: "Website", WEBSITE_BOOKING: "Website booking", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", META_LEAD_AD: "Meta lead ad", PAYMENT_GATEWAY: "Payment gateway" };
const tone = (s: InboundStatus) => (s === "PROCESSED" ? "green" : s === "FAILED" ? "red" : s === "IGNORED" ? "neutral" : "amber");

/** Every enquiry and gateway event that reached the system, with a retry for website enquiries that failed. */
export function InboundEventsPage() {
  const [params, setParams] = useSearchParams();
  const ability = useAbility("admin");
  const replay = useReplayInboundEvent();
  const page = Number(params.get("page") ?? 1);
  const channel = (params.get("channel") ?? "") as InboundChannel | "";
  const status = (params.get("status") ?? "") as InboundStatus | "";
  const { data, isLoading, error } = useInboundEvents({ page, channel: channel || undefined, status: status || undefined });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const retry = async (id: string) => {
    try {
      await replay.mutateAsync(id);
      toast.success("Processed — a lead now exists for this enquiry");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const columns: Column<InboundEventRow>[] = [
    { key: "when", header: "Received", cell: (e) => <span className="whitespace-nowrap text-ink-500">{formatDateTime(e.createdAt)}</span> },
    { key: "channel", header: "Channel", cell: (e) => CHANNEL_LABELS[e.channel] },
    {
      key: "summary",
      header: "What arrived",
      cell: (e) => (
        <div className="max-w-md">
          <p className="truncate font-semibold">{e.summary}</p>
          {e.error && <p className="mt-0.5 truncate text-xs text-red-600" title={e.error}>{e.error}</p>}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (e) => <Badge tone={tone(e.status)}>{e.status.charAt(0) + e.status.slice(1).toLowerCase()}</Badge> },
    { key: "lead", header: "Lead / enquiry", cell: (e) => (e.leadId ? <Link to={`/admin/leads/${e.leadId}`} className="font-semibold text-plum-700 hover:underline">Open lead</Link> : e.enquiryId ? <Link to="/admin/enquiries" className="font-semibold text-plum-700 hover:underline">Enquiry</Link> : <span className="text-ink-300">—</span>) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (e) =>
        ability.can("update", "InboundEvent") && e.channel === "WEBSITE" && e.status !== "PROCESSED" ? (
          <Button variant="ghost" size="sm" aria-label="Replay enquiry" onClick={() => void retry(e.id)} loading={replay.isPending && replay.variables === e.id}>
            <RotateCw className="h-4 w-4" aria-hidden /> Replay
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Inbound events" description="Enquiries and gateway events that reached the system. If a website enquiry failed, replay it here so it isn't lost." />
      <div className="mb-4 flex flex-wrap gap-3">
        <select aria-label="Channel" value={channel} onChange={(e) => set("channel", e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">All channels</option>
          {INBOUND_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => set("status", e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">All statuses</option>
          {INBOUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(e) => e.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Inbox, title: "Nothing has arrived yet" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
    </>
  );
}
