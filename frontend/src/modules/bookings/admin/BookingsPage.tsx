import { BOOKING_STATUS_LABELS, BOOKING_STATUSES, PRODUCT_TYPE_LABELS, PRODUCT_TYPES, type BookingRow, type BookingStatus } from "@mashkoor/shared";
import { Download, Luggage, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useStaffOptions } from "@/modules/users";
import { downloadBookingsCsv, useBookings } from "../api";
import { NewBookingDialog } from "./NewBookingDialog";

const statusTone = (status: BookingStatus) =>
  status === "CONFIRMED" || status === "COMPLETED" ? "green" : status === "CANCELLED" || status === "FAILED" ? "red" : status === "INQUIRY" ? "neutral" : "plum";

export function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");
  const { data: staff = [] } = useStaffOptions();

  const filters = {
    page: Number(params.get("page") ?? 1),
    q: params.get("q") ?? undefined,
    status: (params.get("status") ?? undefined) as BookingStatus | undefined,
    productType: (params.get("productType") ?? undefined) as (typeof PRODUCT_TYPES)[number] | undefined,
    owner: params.get("owner") ?? undefined,
  };
  const { data, isLoading, error } = useBookings(filters);

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const exportCsv = async () => {
    try {
      await downloadBookingsCsv({ status: filters.status, productType: filters.productType, owner: filters.owner, q: filters.q });
    } catch {
      toast.error("Couldn't export the register");
    }
  };

  const columns: Column<BookingRow>[] = [
    {
      key: "ref",
      header: "Booking",
      cell: (b) => (
        <Link to={`/admin/bookings/${b.id}`} className="group block">
          <span className="font-semibold group-hover:text-plum-700">{b.refNo}</span>
          <span className="block text-xs text-ink-500">
            {b.customer.fullName} · {PRODUCT_TYPE_LABELS[b.productType]}
          </span>
        </Link>
      ),
    },
    { key: "destination", header: "Destination", className: "hidden md:table-cell", cell: (b) => b.destination ?? "—" },
    { key: "dates", header: "Travel dates", className: "hidden lg:table-cell", cell: (b) => (b.travelFrom ? `${formatDate(b.travelFrom)} → ${formatDate(b.travelTo)}` : "—") },
    { key: "status", header: "Status", cell: (b) => <Badge tone={statusTone(b.status)}>{BOOKING_STATUS_LABELS[b.status]}</Badge> },
    { key: "sell", header: "Sell price", cell: (b) => formatINR(b.totalSell) },
    { key: "owner", header: "Owner", className: "hidden lg:table-cell", cell: (b) => b.owner?.name ?? <Badge tone="amber">Unassigned</Badge> },
    { key: "created", header: "Created", className: "hidden xl:table-cell", cell: (b) => formatDate(b.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every flight, hotel and package booking Mashkoor has on file."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New booking
            </Button>
          </>
        }
      >
        <input type="search" placeholder="Search ref, customer, destination" defaultValue={filters.q ?? ""} onChange={(e) => set("q", e.target.value)} className={inputClass} />
        <select aria-label="Status" value={filters.status ?? ""} onChange={(e) => set("status", e.target.value)} className={inputClass}>
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select aria-label="Product" value={filters.productType ?? ""} onChange={(e) => set("productType", e.target.value)} className={inputClass}>
          <option value="">All trip types</option>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </select>
        <select aria-label="Owner" value={filters.owner ?? ""} onChange={(e) => set("owner", e.target.value)} className={inputClass}>
          <option value="">All owners</option>
          <option value="me">My bookings</option>
          <option value="unassigned">Unassigned</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </PageHeader>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(b) => b.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Luggage, title: "No bookings yet", description: "Create one from a lead or start fresh." }}
        page={filters.page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />

      <NewBookingDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}
