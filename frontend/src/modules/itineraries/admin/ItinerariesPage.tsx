import { ITINERARY_STATUS_LABELS, ITINERARY_STATUSES, PRODUCT_TYPE_LABELS, type ItineraryRow, type ItineraryStatus } from "@mashkoor/shared";
import { Archive, CalendarRange, Plus, Trash2, Undo2 } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatDate, formatINR, timeAgo } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button, buttonClass } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { SegmentedControl } from "@/core/ui/misc";
import { useDeleteItinerary, useItineraries, useRestoreItinerary } from "../api";

export const itineraryTone = (s: ItineraryStatus) => (s === "ACCEPTED" || s === "CONVERTED" ? "green" : s === "SHARED" ? "plum" : "neutral");

type View = "customers" | "templates" | "archive";

export function ItinerariesPage() {
  const [params, setParams] = useSearchParams();
  const ability = useAbility("admin");
  const page = Number(params.get("page") ?? 1);
  const view = (params.get("view") ?? "customers") as View;
  const status = (params.get("status") ?? "") as ItineraryStatus | "";
  const q = params.get("q") ?? "";
  const remove = useDeleteItinerary();
  const restore = useRestoreItinerary();
  const { data, isLoading, error } = useItineraries({ page, q, template: view === "templates" ? "true" : view === "archive" ? undefined : "false", archived: view === "archive" ? "true" : "false", status: status || undefined });
  const canDelete = ability.can("delete", "Itinerary");

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
      header: "Quotation",
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
    { key: "updated", header: view === "archive" ? "Archived" : "Updated", cell: (i) => <span className="text-ink-500">{timeAgo(view === "archive" ? (i.archivedAt ?? i.updatedAt) : i.updatedAt)}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (i) =>
        canDelete &&
        (view === "archive" ? (
          <Button size="sm" variant="secondary" loading={restore.isPending && restore.variables === i.id} onClick={() => void withToast(restore.mutateAsync(i.id), `${i.refNo} restored`)}>
            <Undo2 className="h-4 w-4" aria-hidden /> Restore
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${i.refNo}`}
            title="Delete — moves it to the archive"
            onClick={() => window.confirm(`Delete ${i.refNo}? It moves to the archive and its share link stops working. You can restore it any time.`) && void withToast(remove.mutateAsync(i.id), `${i.refNo} moved to the archive`)}
          >
            <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
          </Button>
        )),
    },
  ];

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Build a day-by-day plan with a price, share it as a link, and turn an accepted one into a booking."
        actions={
          ability.can("create", "Itinerary") && view !== "archive" && (
            <Link to={`/admin/itineraries/new${view === "templates" ? "?template=1" : ""}`} className={buttonClass("primary")}>
              <Plus className="h-4 w-4" aria-hidden /> {view === "templates" ? "New template" : "New quotation"}
            </Link>
          )
        }
      >
        <SegmentedControl<View>
          options={[
            { value: "customers", label: "Customer plans" },
            { value: "templates", label: "Templates" },
            { value: "archive", label: "Archive" },
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
        empty={{ icon: view === "archive" ? Archive : CalendarRange, title: view === "templates" ? "No templates yet" : view === "archive" ? "The archive is empty" : "No quotations yet", description: view === "templates" ? "Save a plan you reuse often (e.g. 5N Umrah) as a template." : view === "archive" ? "Quotations you delete are kept here, and can be restored." : "Create one from here, or from a lead." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
    </>
  );
}
