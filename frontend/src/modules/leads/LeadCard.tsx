import { formatPhone, PRODUCT_TYPE_LABELS, type LeadRow } from "@mashkoor/shared";
import { CalendarClock, Flame } from "lucide-react";
import { Link } from "react-router";
import { formatDate, formatDateTime, isOverdue, timeAgo, travellersLabel } from "@/core/format";
import { cn } from "@/core/ui/cn";
import { Avatar } from "@/core/ui/misc";

const priorityBar = { HOT: "bg-red-500", WARM: "bg-gold-400", COLD: "bg-sky-300" } as const;

export function LeadCard({ lead, draggable, onDragStart }: { lead: LeadRow; draggable?: boolean; onDragStart?: (e: React.DragEvent) => void }) {
  const overdue = lead.nextFollowUpAt && isOverdue(lead.nextFollowUpAt) && lead.stage !== "WON" && lead.stage !== "LOST";
  return (
    <Link
      to={`/admin/leads/${lead.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      className="group relative block overflow-hidden rounded-lg border border-line bg-white p-3 pl-4 shadow-xs transition hover:border-plum-200 hover:shadow-md"
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", priorityBar[lead.priority])} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold text-ink-900 group-hover:text-plum-700">{lead.contactName}</p>
        {lead.priority === "HOT" && <Flame className="h-4 w-4 shrink-0 text-red-500" aria-label="Hot lead" />}
      </div>
      <p className="mt-0.5 text-xs text-ink-500">
        {PRODUCT_TYPE_LABELS[lead.productType]}
        {lead.destination ? ` · ${lead.destination}` : ""}
      </p>
      <p className="mt-1 text-xs text-ink-500">
        {lead.travelFrom ? formatDate(lead.travelFrom) : "Dates open"} · {travellersLabel(lead.adults, lead.children, lead.infants)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        {lead.nextFollowUpAt ? (
          <span className={cn("inline-flex items-center gap-1", overdue ? "font-semibold text-red-600" : "text-ink-500")} title={formatDateTime(lead.nextFollowUpAt)}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {timeAgo(lead.nextFollowUpAt)}
          </span>
        ) : (
          <span className="text-ink-300">{formatPhone(lead.phone)}</span>
        )}
        {lead.owner ? <Avatar name={lead.owner.name} className="h-6 w-6 text-[10px]" /> : <span className="rounded bg-gold-50 px-1.5 py-0.5 font-semibold text-gold-700">Unassigned</span>}
      </div>
    </Link>
  );
}
