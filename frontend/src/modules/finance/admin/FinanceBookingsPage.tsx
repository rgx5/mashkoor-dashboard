import type { FinanceBookingRow, FinanceBookingsQuery } from "@mashkoor/shared";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@mashkoor/shared";
import { Scale } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Card, PageHeader } from "@/core/ui/layout";
import { useFinanceBookings } from "../api";
import { RecordEntryDialog, type EntryPreset } from "./EntryDialogs";

const SHOW: { value: FinanceBookingsQuery["show"]; label: string }[] = [
  { value: "all", label: "All live bookings" },
  { value: "owing", label: "Customer still owes us" },
  { value: "supplier-due", label: "We still owe suppliers" },
];

const money = (n: number, zero = "—") => (n === 0 ? zero : formatINR(n));

/** For every live booking: what the customer has paid, what the suppliers have been paid, and the margin so far. */
export function FinanceBookingsPage() {
  const ability = useAbility("admin");
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";
  const show = (params.get("show") ?? "all") as FinanceBookingsQuery["show"];
  const { data, isLoading, error } = useFinanceBookings({ page, q: q || undefined, show });
  const [recording, setRecording] = useState<EntryPreset | null>(null);

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });

  const columns: Column<FinanceBookingRow>[] = [
    {
      key: "booking",
      header: "Booking",
      cell: (b) => (
        <div>
          <Link to={`/admin/bookings/${b.id}`} className="font-semibold text-plum-700 hover:underline">
            {b.refNo}
          </Link>
          <p className="text-xs text-ink-500">
            {b.customer.fullName}
            {b.travelFrom && ` · departs ${formatDate(b.travelFrom)}`}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (b) => <span className="text-xs whitespace-nowrap text-ink-700">{BOOKING_STATUS_LABELS[b.status as BookingStatus] ?? b.status}</span> },
    { key: "sell", header: "Sold for", className: "text-right", cell: (b) => <span className="tabular-nums">{formatINR(b.sell)}</span> },
    { key: "collected", header: "Collected", className: "text-right", cell: (b) => <span className="tabular-nums text-emerald-700">{money(b.collected)}</span> },
    { key: "receivable", header: "Customer owes", className: "text-right", cell: (b) => <span className={cn("font-semibold tabular-nums", b.receivable > 0 && "text-gold-700")}>{money(b.receivable)}</span> },
    { key: "cost", header: "Supplier cost", className: "text-right", cell: (b) => <span className="tabular-nums">{b.cost === 0 ? <span className="text-xs text-ink-300">not entered</span> : formatINR(b.cost)}</span> },
    { key: "paid", header: "Paid to suppliers", className: "text-right", cell: (b) => <span className="tabular-nums text-red-600">{money(b.supplierPaid)}</span> },
    { key: "due", header: "We owe", className: "text-right", cell: (b) => <span className={cn("font-semibold tabular-nums", b.supplierDue > 0 && "text-gold-700")}>{money(b.supplierDue)}</span> },
    {
      key: "margin",
      header: "Margin",
      className: "text-right",
      cell: (b) => (
        <div className="tabular-nums">
          <p className={cn("font-semibold", b.cashMargin < 0 && "text-red-600")} title="Collected minus paid to suppliers">
            {formatINR(b.cashMargin)}
          </p>
          <p className="text-[11px] text-ink-500" title="Sold for minus supplier cost">
            of {formatINR(b.expectedMargin)}
          </p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (b) =>
        ability.can("create", "FinanceEntry") && (
          <Button size="sm" variant="secondary" onClick={() => setRecording({ direction: "OUT", category: "SUPPLIER_PAYMENT", booking: { id: b.id, refNo: b.refNo } })}>
            Pay supplier
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Booking profit" description="What each booking has collected, what suppliers have been paid, and the margin so far">
        <input className={inputClass} type="search" placeholder="Search booking or customer…" aria-label="Search bookings" defaultValue={q} onChange={(e) => set("q", e.target.value)} />
        <select className={inputClass} aria-label="Show" value={show} onChange={(e) => set("show", e.target.value === "all" ? "" : e.target.value)}>
          {SHOW.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </PageHeader>

      {data && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="px-4 py-3">
            <p className="text-xs font-semibold text-ink-500">Collected</p>
            <p className="text-lg font-bold tabular-nums">{formatINR(data.totals.collected)}</p>
            <p className="text-xs text-ink-500">of {formatINR(data.totals.sell)} sold</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs font-semibold text-ink-500">Customers still owe</p>
            <p className="text-lg font-bold tabular-nums text-gold-700">{formatINR(data.totals.receivable)}</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs font-semibold text-ink-500">Paid to suppliers</p>
            <p className="text-lg font-bold tabular-nums text-red-600">{formatINR(data.totals.supplierPaid)}</p>
            <p className="text-xs text-ink-500">of {formatINR(data.totals.cost)} cost · {formatINR(data.totals.supplierDue)} still owed</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs font-semibold text-ink-500">Cash margin so far</p>
            <p className={cn("text-lg font-bold tabular-nums", data.totals.cashMargin < 0 && "text-red-600")}>{formatINR(data.totals.cashMargin)}</p>
            <p className="text-xs text-ink-500">{formatINR(data.totals.expectedMargin)} once everything is settled</p>
          </Card>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.rows}
        rowKey={(b) => b.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Scale, title: "No bookings to show", description: "Bookings appear here once they are awaiting payment or confirmed." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => { const next = new URLSearchParams(prev); next.set("page", String(p)); return next; })}
      />
      <p className="mt-3 text-xs text-ink-500">Supplier cost comes from the cost entered on each booking's items. Where it's blank, enter it on the booking and the amount owed here will follow.</p>

      <RecordEntryDialog open={Boolean(recording)} onClose={() => setRecording(null)} preset={recording ?? undefined} />
    </>
  );
}
