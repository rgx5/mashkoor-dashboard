import { ENQUIRY_COLUMN_LABELS, ENQUIRY_COLUMNS, formatPhone, LEAD_SOURCE_LABELS, whatsappUrl, type EnquiryColumn, type EnquiryRow, type LeadSource } from "@mashkoor/shared";
import { Building, Camera, Check, ChevronDown, Footprints, Globe, Inbox, MessageCircle, Phone, Plus, StickyNote, Tag, Users, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { withToast } from "@/core/api/errors";
import { timeAgo } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { StaffSelect } from "@/modules/users";
import { useAssignEnquiry, useEnquiryBoard } from "../api";
import { ContactedDialog, ConvertDialog, NewEnquiryDialog } from "./EnquiryDialogs";

const COLUMN_HINT: Record<EnquiryColumn, string> = {
  unassigned: "Assign each one to a sales rep",
  new: "Assigned — waiting for the first call",
  contacted: "Called — convert once you know what they want",
};

const COLUMN_TONE: Record<EnquiryColumn, string> = {
  unassigned: "border-t-red-400",
  new: "border-t-gold-400",
  contacted: "border-t-plum-500",
};

export function EnquiriesPage() {
  const ability = useAbility("admin");
  const canAssign = ability.can("assign", "Enquiry");
  const [owner, setOwner] = useState("");
  const { data, isLoading } = useEnquiryBoard({ owner: owner || undefined });
  const [creating, setCreating] = useState(false);
  const [contacting, setContacting] = useState<EnquiryRow | null>(null);
  const [converting, setConverting] = useState<EnquiryRow | null>(null);

  // Reps only ever have their own enquiries, so the "unassigned" column is for managers.
  const columns = ENQUIRY_COLUMNS.filter((c) => canAssign || c !== "unassigned");
  const total = data ? columns.reduce((sum, c) => sum + data[c].total, 0) : 0;

  return (
    <>
      <PageHeader
        title="Enquiries"
        description={canAssign ? "Raw enquiries. Assign each one to a sales representative." : "People waiting for your call. Convert them to leads once you know what they want."}
        actions={
          ability.can("create", "Enquiry") && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New enquiry
            </Button>
          )
        }
      >
        {canAssign && <StaffSelect aria-label="Filter by sales rep" emptyLabel="All staff" value={owner} onChange={(e) => setOwner(e.target.value)} />}
      </PageHeader>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {data && total === 0 && <EmptyState icon={Inbox} title="No enquiries waiting" description="New website, WhatsApp and phone enquiries appear here the moment they arrive." />}
      {data && total > 0 && (
        <div className={cn("grid gap-4", columns.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
          {columns.map((column) => (
            <section key={column} aria-label={ENQUIRY_COLUMN_LABELS[column]} className={cn("rounded-xl border-t-4 bg-plum-50/50 p-3", COLUMN_TONE[column])}>
              <header className="mb-3 flex items-start justify-between gap-2 px-1">
                <div>
                  <h2 className="text-xs font-bold tracking-wide text-ink-700 uppercase">{ENQUIRY_COLUMN_LABELS[column]}</h2>
                  <p className="text-xs text-ink-500">{COLUMN_HINT[column]}</p>
                </div>
                <Badge tone={column === "unassigned" && data[column].total > 0 ? "red" : "plum"}>{data[column].total}</Badge>
              </header>
              <div className="space-y-3">
                {data[column].enquiries.map((e) => (
                  <EnquiryCard key={e.id} enquiry={e} canAssign={canAssign} onContacted={() => setContacting(e)} onConvert={() => setConverting(e)} />
                ))}
                {data[column].enquiries.length === 0 && <p className="px-1 py-6 text-center text-xs text-ink-300">Nothing here</p>}
              </div>
            </section>
          ))}
        </div>
      )}

      <NewEnquiryDialog open={creating} onClose={() => setCreating(false)} />
      <ContactedDialog enquiry={contacting} onClose={() => setContacting(null)} />
      <ConvertDialog enquiry={converting} onClose={() => setConverting(null)} />
    </>
  );
}

const SOURCE_ICON: Record<LeadSource, LucideIcon> = {
  WEBSITE: Globe,
  WHATSAPP: MessageCircle,
  INSTAGRAM: Camera,
  PHONE: Phone,
  WALK_IN: Footprints,
  REFERRAL: Users,
  B2B: Building,
  B2C_PORTAL: Globe,
  OTHER: Tag,
};

const iconButton = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line transition hover:bg-plum-50";

/** One enquiry, kept small: the person and what they said first, then where it came from, any call notes, and the next step. */
function EnquiryCard({ enquiry: e, canAssign, onContacted, onConvert }: { enquiry: EnquiryRow; canAssign: boolean; onContacted: () => void; onConvert: () => void }) {
  const assign = useAssignEnquiry();
  const [expanded, setExpanded] = useState(false);
  const waitingDays = Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 86_400_000);
  const SourceIcon = SOURCE_ICON[e.source];
  const longMessage = Boolean(e.message && (e.message.length > 90 || e.message.split("\n").length > 2));

  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base leading-tight font-semibold text-ink-900">{e.contactName}</h3>
          <p className="text-base leading-tight font-semibold text-ink-900">{formatPhone(e.phone)}</p>
        </div>
        <span className="flex shrink-0 gap-1.5">
          <a href={`tel:${e.phone}`} aria-label={`Call ${e.contactName}`} title="Call" className={cn(iconButton, "text-ink-700")}>
            <Phone className="h-4 w-4" aria-hidden />
          </a>
          <a
            href={whatsappUrl(e.phone, `Assalamu Alaikum ${e.contactName.split(" ")[0]}, this is Mashkoor International Tourism regarding your enquiry.`)}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${e.contactName}`}
            title="WhatsApp"
            className={cn(iconButton, "text-emerald-600 hover:bg-emerald-50")}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
          </a>
        </span>
      </div>

      {e.message && (
        <div className="mt-2.5">
          <p className={cn("text-[13px] leading-snug font-semibold whitespace-pre-line text-ink-900", !expanded && "line-clamp-2")}>{e.message}</p>
          {longMessage && (
            <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-plum-700 hover:underline">
              {expanded ? "Show less" : "Show full message"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition", expanded && "rotate-180")} aria-hidden />
            </button>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-500" title={`${LEAD_SOURCE_LABELS[e.source]}${e.sourceDetail ? ` · ${e.sourceDetail}` : ""}`}>
          <SourceIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{LEAD_SOURCE_LABELS[e.source]}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{timeAgo(e.createdAt)}</span>
        </p>
        {waitingDays >= 1 && (
          <span title={`Waiting ${waitingDays} day${waitingDays > 1 ? "s" : ""}`}>
            <Badge tone={waitingDays >= 2 ? "red" : "amber"}>{waitingDays}d</Badge>
          </span>
        )}
      </div>

      {e.notes && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gold-700" title={e.notes}>
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{e.notes}</span>
        </p>
      )}

      {(canAssign || e.owner) && (
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          {canAssign && (
            <StaffSelect
              roles={["SALES_AGENT", "OPS_MANAGER", "SUPER_ADMIN"]}
              emptyLabel="Assign to…"
              aria-label={`Assign ${e.contactName}`}
              className="h-8 min-w-0 flex-1 py-0 text-xs"
              value={e.owner?.id ?? ""}
              disabled={assign.isPending}
              onChange={(ev) => withToast(assign.mutateAsync({ id: e.id, ownerId: ev.target.value || null }), "Enquiry assigned")}
            />
          )}
          {e.owner && (
            <>
              {e.status === "NEW" && (
                <button type="button" aria-label="Mark contacted" title="Mark contacted" className={cn(iconButton, "text-ink-700")} onClick={onContacted}>
                  <Check className="h-4 w-4" aria-hidden />
                </button>
              )}
              <Button size="sm" className={canAssign ? undefined : "flex-1"} onClick={onConvert}>
                Convert to lead
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
