import {
  BOARD_STAGES,
  formatPhone,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  PRODUCT_TYPE_LABELS,
  type LeadRow,
  type LeadStage,
} from "@mashkoor/shared";
import { Columns3, List, Plus, Search, Target } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatDate, formatDateTime, isOverdue, travellersLabel } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { SegmentedControl } from "@/core/ui/misc";
import { Spinner } from "@/core/ui/Spinner";
import { useStaffOptions } from "@/modules/users";
import { useAssignLead, useLeadBoard, useLeads, type LeadFilters } from "../api";
import { LeadCard } from "../LeadCard";
import { StageChangeDialog, type PendingStageChange } from "../StageChangeDialog";
import { NewLeadDialog } from "./NewLeadDialog";

const stageText = { green: "text-emerald-700", red: "text-red-700", amber: "text-gold-700", plum: "text-ink-900" } as const;
const stageTone = (stage: LeadStage) => (stage === "WON" ? "green" : stage === "LOST" ? "red" : stage === "NEW" ? "amber" : "plum");

export function LeadsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "board" ? "board" : "list";
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");
  const stage = (params.get("stage") ?? "") as LeadStage | "";

  const filters: LeadFilters = {
    q: params.get("q") ?? "",
    owner: params.get("owner") ?? "",
    source: (params.get("source") ?? "") as LeadFilters["source"],
    productType: (params.get("productType") ?? "") as LeadFilters["productType"],
    tripType: (params.get("tripType") ?? "") as LeadFilters["tripType"],
    followUp: (params.get("followUp") ?? "") as LeadFilters["followUp"],
  };

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      next.delete("new");
      return next;
    });

  return (
    <>
      <PageHeader title="Leads" description="Every enquiry from website, WhatsApp, Instagram, phone and walk-ins." />

      {/* One toolbar row. Filters live in the URL so views can be shared. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search leads</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
          <input type="search" defaultValue={filters.q} onChange={(e) => set("q", e.target.value)} placeholder="Name, mobile, MKL number, destination" className={`${inputClass} pl-9`} />
        </label>
        <select aria-label="Source" value={filters.source} onChange={(e) => set("source", e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        {view === "list" && (
          <select aria-label="Stage" value={stage} onChange={(e) => set("stage", e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <SegmentedControl
          value={view}
          onChange={(v) => set("view", v === "list" ? "" : v)}
          options={[
            { value: "board", label: "Board", icon: <Columns3 className="h-4 w-4" aria-hidden /> },
            { value: "list", label: "List", icon: <List className="h-4 w-4" aria-hidden /> },
          ]}
        />
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> New lead
        </Button>
      </div>

      {view === "board" ? <Board filters={filters} /> : <LeadList filters={{ ...filters, page: Number(params.get("page") ?? 1), stage }} onFilter={set} />}

      <NewLeadDialog open={newOpen} onClose={() => (setNewOpen(false), set("new", ""))} prefill={params.get("customerId") ? { customerId: params.get("customerId")! } : undefined} />
    </>
  );
}

function Board({ filters }: { filters: LeadFilters }) {
  const { data, isLoading, error } = useLeadBoard(filters);
  const [dragging, setDragging] = useState<LeadRow | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [pending, setPending] = useState<PendingStageChange | null>(null);

  if (isLoading && !data)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  if (error) return <p className="py-10 text-center text-sm text-red-600">{errorMessage(error, "Unable to load the pipeline")}</p>;
  if (!data) return null;

  const drop = (stage: LeadStage) => {
    setOver(null);
    if (!dragging || dragging.stage === stage) return;
    // Every move goes through the dialog: LOST needs a reason, and any note is captured at the same time.
    setPending({ leadId: dragging.id, refNo: dragging.refNo, from: dragging.stage, to: stage });
    setDragging(null);
  };

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-3">
          {BOARD_STAGES.map((stage) => {
            const column = data[stage];
            return (
              <section
                key={stage}
                aria-label={LEAD_STAGE_LABELS[stage]}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(stage);
                }}
                onDragLeave={() => setOver((s) => (s === stage ? null : s))}
                onDrop={() => drop(stage)}
                className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-plum-50/50 transition", over === stage && dragging?.stage !== stage && "bg-plum-100 ring-2 ring-plum-300")}
              >
                <header className="flex items-center justify-between px-3 py-2.5">
                  <h2 className="text-xs font-bold tracking-wide text-ink-700 uppercase">{LEAD_STAGE_LABELS[stage]}</h2>
                  <Badge tone={stageTone(stage)}>{column.total}</Badge>
                </header>
                <div className="flex max-h-[calc(100dvh-19rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {column.leads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(lead);
                      }}
                    />
                  ))}
                  {column.total > column.leads.length && <p className="px-1 py-2 text-center text-xs text-ink-500">+{column.total - column.leads.length} more — use list view</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <StageChangeDialog pending={pending} onClose={() => setPending(null)} />
    </>
  );
}

function LeadList({ filters, onFilter }: { filters: LeadFilters & { page: number }; onFilter: (key: string, value: string) => void }) {
  const { data, isLoading, error } = useLeads(filters);
  const { data: staff = [] } = useStaffOptions();
  const assign = useAssignLead();
  const [pending, setPending] = useState<PendingStageChange | null>(null);

  const columns: Column<LeadRow>[] = [
    {
      key: "contact",
      header: "Lead",
      cell: (l) => (
        <Link to={`/admin/leads/${l.id}`} className="group block">
          <span className="font-semibold group-hover:text-plum-700">{l.contactName}</span>
          <span className="block text-xs text-ink-500">
            {l.refNo} · {formatPhone(l.phone)}
          </span>
        </Link>
      ),
    },
    {
      key: "trip",
      header: "Trip",
      cell: (l) => (
        <div className="text-sm">
          <p>
            {PRODUCT_TYPE_LABELS[l.productType]}
            {l.destination ? ` · ${l.destination}` : ""}
          </p>
          <p className="text-xs text-ink-500">
            {l.travelFrom ? formatDate(l.travelFrom) : "Dates open"} · {travellersLabel(l.adults, l.children, l.infants)}
          </p>
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      cell: (l) => (
        <select
          aria-label={`Stage for ${l.refNo}`}
          value={l.stage}
          onChange={(e) => setPending({ leadId: l.id, refNo: l.refNo, from: l.stage, to: e.target.value as LeadStage })}
          className={cn("w-40 cursor-pointer rounded-lg border border-line bg-white py-1 pl-2 text-sm font-medium", stageText[stageTone(l.stage)])}
        >
          {LEAD_STAGES.map((st) => (
            <option key={st} value={st}>
              {LEAD_STAGE_LABELS[st]}
            </option>
          ))}
        </select>
      ),
    },
    { key: "source", header: "Source", className: "hidden lg:table-cell", cell: (l) => <span className="text-ink-500">{LEAD_SOURCE_LABELS[l.source]}</span> },
    {
      key: "followUp",
      header: "Follow-up",
      className: "hidden md:table-cell",
      cell: (l) => (l.nextFollowUpAt ? <span className={isOverdue(l.nextFollowUpAt) && l.stage !== "WON" && l.stage !== "LOST" ? "font-semibold text-red-600" : "text-ink-700"}>{formatDateTime(l.nextFollowUpAt)}</span> : <span className="text-ink-300">—</span>),
    },
    {
      key: "owner",
      header: "Owner",
      className: "hidden lg:table-cell",
      cell: (l) => (
        <select
          aria-label={`Owner for ${l.refNo}`}
          value={l.owner?.id ?? ""}
          onChange={(e) => void withToast(assign.mutateAsync({ id: l.id, ownerId: e.target.value || null }), "Owner updated")}
          className={cn("w-40 cursor-pointer rounded-lg border border-line bg-white py-1 pl-2 text-sm", !l.owner && "text-gold-700")}
        >
          <option value="">Unassigned</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      ),
    },
    { key: "created", header: "Received", className: "hidden xl:table-cell", cell: (l) => <span className="text-ink-500">{formatDate(l.createdAt)}</span> },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={error ? errorMessage(error, "Unable to load leads") : null}
        empty={{ icon: Target, title: "No leads found", description: "Try different filters, or add a lead from a call or walk-in." }}
        page={filters.page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => onFilter("page", String(p))}
      />
      <StageChangeDialog pending={pending} onClose={() => setPending(null)} />
    </>
  );
}
