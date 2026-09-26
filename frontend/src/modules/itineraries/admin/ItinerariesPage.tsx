import { ITINERARY_STATUS_LABELS, ITINERARY_STATUSES, PRODUCT_TYPE_LABELS, type ItineraryRow, type ItineraryStatus } from "@mashkoor/shared";
import { CalendarRange, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR, timeAgo } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { buttonClass } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { SegmentedControl } from "@/core/ui/misc";
import { useItineraries } from "../api";

export const itineraryTone = (s: ItineraryStatus) => (s === "ACCEPTED" || s === "CONVERTED" ? "green" : s === "SHARED" ? "plum" : "neutral");

type View = "customers" | "templates";

export function ItinerariesPage() {
  const [params, setParams] = useSearchParams();
  const ability = useAbility("admin");
  const page = Number(params.get("page") ?? 1);
  const view = (params.get("view") ?? "customers") as View;
  const status = (params.get("status") ?? "") as ItineraryStatus | "";
  const q = params.get("q") ?? "";
  const { data, isLoading, error } = useItineraries({ page, q, template: view === "templates" ? "true" : "false", status: status || undefined });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const columns: Column<ItineraryRow>[] = [
    {
      key: "title",
      header: "Itinerary",
      cell: (i) => (
        <Link to={`/admin/itineraries/${i.id}`} className="font-semibold text-plum-700 hover:underline">
          {i.title}
          <span className="block text-xs font-normal text-ink-500">
            {i.refNo} · {PRODUCT_TYPE_LABELS[i.productType]}
            {i.destination ? ` · ${i.destination}` : ""}
          </span>
        </Link>
      ),
    },
    ...(view === "templates"
      ? []
      : [
          {
            key: "customer",
            header: "For",
            cell: (i: ItineraryRow) => (i.customer ? <Link to={`/admin/customers/${i.customer.id}`} className="hover:underline">{i.customer.fullName}</Link> : i.lead ? <span className="text-ink-500">Lead {i.lead.refNo}</span> : <span className="text-ink-500">—</span>),
          },
          { key: "travel", header: "Travel", cell: (i: ItineraryRow) => formatDate(i.travelFrom) },
          { key: "status", header: "Status", cell: (i: ItineraryRow) => <Badge tone={itineraryTone(i.status)}>{ITINERARY_STATUS_LABELS[i.status]}</Badge> },
          { key: "views", header: "Views", cell: (i: ItineraryRow) => (i.status === "DRAFT" ? "—" : i.viewCount) },
        ]),
    { key: "total", header: "Price", className: "text-right", cell: (i) => <span className="font-semibold">{i.totalPrice ? formatINR(i.totalPrice) : "—"}</span> },
    { key: "updated", header: "Updated", cell: (i) => <span className="text-ink-500">{timeAgo(i.updatedAt)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Itineraries"
        description="Build a day-by-day plan with a price, share it as a link, and turn an accepted one into a booking."
        actions={
          ability.can("create", "Itinerary") && (
            <Link to={`/admin/itineraries/new${view === "templates" ? "?template=1" : ""}`} className={buttonClass("primary")}>
              <Plus className="h-4 w-4" aria-hidden /> {view === "templates" ? "New template" : "New itinerary"}
            </Link>
          )
        }
      >
        <SegmentedControl<View>
          options={[
            { value: "customers", label: "Customer plans" },
            { value: "templates", label: "Templates" },
          ]}
          value={view}
          onChange={(v) => set("view", v === "customers" ? "" : v)}
        />
        <input type="search" placeholder="Search title or reference…" defaultValue={q} onChange={(e) => set("q", e.target.value)} className={`${inputClass} w-64`} />
        {view === "customers" && (
          <select aria-label="Status" value={status} onChange={(e) => set("status", e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All statuses</option>
            {ITINERARY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ITINERARY_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </PageHeader>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(i) => i.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: CalendarRange, title: view === "templates" ? "No templates yet" : "No itineraries yet", description: view === "templates" ? "Save a plan you reuse often (e.g. 5N Umrah) as a template." : "Create one from here, or from a lead." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
    </>
  );
}
