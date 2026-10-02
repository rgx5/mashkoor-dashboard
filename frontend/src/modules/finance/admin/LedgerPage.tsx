import { FINANCE_DIRECTIONS, LEDGER_KIND_LABELS, LEDGER_KINDS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type FinanceDirection, type LedgerKind, type LedgerRow, type PaymentMethod } from "@mashkoor/shared";
import { BookOpenText, Download, Paperclip, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { saveFile } from "@/core/api/client";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, Card, PageHeader } from "@/core/ui/layout";
import { downloadReceipt, fetchWholeLedger, useLedger } from "../api";
import { RecordEntryDialog, ReverseDialog, type EntryPreset } from "./EntryDialogs";
import { defaultRange, DirectionIcon, kindLabel, RangeBar } from "./parts";

const csvCell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function toCsv(rows: LedgerRow[]) {
  const header = ["Date", "Ref", "Direction", "Type", "Party", "Description", "Booking", "Invoice", "Method", "Reference", "Amount (INR)", "Recorded by", "Status", "Notes"];
  const lines = rows.map((r) =>
    [r.date, r.entryNo, r.direction === "IN" ? "In" : "Out", kindLabel(r), r.party, r.description, r.booking?.refNo, r.invoice?.refNo, r.method ? PAYMENT_METHOD_LABELS[r.method] : "", r.reference, r.direction === "IN" ? r.amount : -r.amount, r.recordedBy, r.reversed ? "Cancelled" : r.reversalOf ? "Cancellation" : "", r.notes].map(csvCell).join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\n");
}

export function LedgerPage() {
  const ability = useAbility("admin");
  const [params, setParams] = useSearchParams();
  const fallback = defaultRange();
  const from = params.get("from") ?? fallback.from;
  const to = params.get("to") ?? fallback.to;
  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";
  const direction = (params.get("direction") ?? "") as FinanceDirection | "";
  const method = (params.get("method") ?? "") as PaymentMethod | "";
  const kind = (params.get("kind") ?? "") as LedgerKind | "";
  const filters = { from, to, q: q || undefined, direction: direction || undefined, method: method || undefined, kind: kind || undefined };
  const { data, isLoading, error } = useLedger({ ...filters, page, pageSize: 50 });
  const [recording, setRecording] = useState<EntryPreset | null>(null);
  const [cancelling, setCancelling] = useState<LedgerRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  const setRange = (f: string, t: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("from", f);
      next.set("to", t);
      next.delete("page");
      return next;
    });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchWholeLedger(filters);
      if (all.meta.total > all.rows.length) toast.warning(`Only the first ${all.rows.length} of ${all.meta.total} entries were exported. Narrow the dates and export again.`);
      saveFile(new Blob([toCsv(all.rows)], { type: "text/csv;charset=utf-8" }), `ledger-${from}-to-${to}.csv`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const canCancel = ability.can("update", "FinanceEntry");

  const columns: Column<LedgerRow>[] = [
    { key: "date", header: "Date", cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span> },
    { key: "ref", header: "Ref", cell: (r) => <span className="font-mono text-xs whitespace-nowrap text-ink-700">{r.entryNo ?? "—"}</span> },
    {
      key: "details",
      header: "Details",
      cell: (r) => (
        <div className="flex items-start gap-2.5">
          <DirectionIcon direction={r.direction} />
          <div className="min-w-0">
            <p className={cn("flex flex-wrap items-center gap-1.5 font-semibold text-ink-900", r.reversed && "text-ink-500 line-through")}>
              {kindLabel(r)}
              {r.reversed && <Badge tone="red">Cancelled</Badge>}
              {r.reversalOf && <Badge tone="amber">Cancels {r.reversalOf}</Badge>}
            </p>
            <p className="truncate text-xs text-ink-500">{[r.party, r.reference && `Ref ${r.reference}`].filter(Boolean).join(" · ") || "—"}</p>
            {r.notes && <p className="line-clamp-1 text-xs text-ink-500 italic" title={r.notes}>{r.notes}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "links",
      header: "For",
      cell: (r) => (
        <div className="space-y-0.5 text-xs">
          {r.booking && (
            <Link to={`/admin/bookings/${r.booking.id}`} className="block font-semibold text-plum-700 hover:underline">
              {r.booking.refNo}
            </Link>
          )}
          {r.invoice && (
            <Link to={`/admin/invoices/${r.invoice.id}`} className="block text-ink-700 hover:underline">
              {r.invoice.refNo}
            </Link>
          )}
          {r.partner && (
            <Link to={`/admin/partners/${r.partner.id}`} className="block font-semibold text-plum-700 hover:underline">
              {r.partner.refNo}
            </Link>
          )}
          {!r.booking && !r.invoice && !r.partner && <span className="text-ink-300">—</span>}
        </div>
      ),
    },
    { key: "method", header: "Method", cell: (r) => <span className="whitespace-nowrap text-ink-700">{r.method ? PAYMENT_METHOD_LABELS[r.method] : "—"}</span> },
    {
      key: "amount",
      header: "Amount",
      className: "text-right",
      cell: (r) => (
        <span className={cn("font-semibold whitespace-nowrap tabular-nums", r.direction === "IN" ? "text-emerald-700" : "text-red-600", r.reversed && "opacity-50 line-through")}>
          {r.direction === "IN" ? "+" : "−"}
          {formatINR(r.amount)}
        </span>
      ),
    },
    { key: "by", header: "By", cell: (r) => <span className="text-xs whitespace-nowrap text-ink-500">{r.recordedBy ?? "—"}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (r) => (
        <span className="flex items-center justify-end gap-1">
          {r.hasReceipt && (
            <button type="button" title="Download receipt" aria-label={`Download receipt for ${r.entryNo}`} className="rounded-lg p-1.5 text-ink-500 hover:bg-plum-50 hover:text-plum-700" onClick={() => downloadReceipt(r.sourceId, `${r.entryNo}-receipt`).catch((e) => toast.error(errorMessage(e)))}>
              <Paperclip className="h-4 w-4" aria-hidden />
            </button>
          )}
          {canCancel && r.source === "MANUAL" && !r.reversed && !r.reversalOf && (
            <button type="button" title="Cancel this entry" aria-label={`Cancel ${r.entryNo}`} className="rounded-lg p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600" onClick={() => setCancelling(r)}>
              <Undo2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Ledger"
        description="Every payment, refund, top-up and expense, in date order"
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={!data || data.meta.total === 0}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
            {ability.can("create", "FinanceEntry") && (
              <>
                <Button variant="secondary" onClick={() => setRecording({ direction: "IN" })}>
                  <Plus className="h-4 w-4" aria-hidden /> Money in
                </Button>
                <Button onClick={() => setRecording({ direction: "OUT" })}>
                  <Plus className="h-4 w-4" aria-hidden /> Money out
                </Button>
              </>
            )}
          </>
        }
      >
        <input className={inputClass} type="search" placeholder="Search name, ref, booking…" aria-label="Search the ledger" defaultValue={q} onChange={(e) => set("q", e.target.value)} />
        <select className={inputClass} aria-label="Direction" value={direction} onChange={(e) => set("direction", e.target.value)}>
          <option value="">In and out</option>
          {FINANCE_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d === "IN" ? "Money in" : "Money out"}
            </option>
          ))}
        </select>
        <select className={inputClass} aria-label="Type" value={kind} onChange={(e) => set("kind", e.target.value)}>
          <option value="">All types</option>
          {LEDGER_KINDS.map((k) => (
            <option key={k} value={k}>
              {LEDGER_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select className={inputClass} aria-label="Method" value={method} onChange={(e) => set("method", e.target.value)}>
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </PageHeader>

      <div className="mb-4">
        <RangeBar from={from} to={to} onChange={setRange} />
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Card className="px-4 py-3">
            <p className="text-xs font-semibold text-ink-500">In</p>
            <p className="text-lg font-bold text-emerald-700 tabular-nums">{formatINR(data.totals.in)}</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs font-semibold text-ink-500">Out</p>
            <p className="text-lg font-bold text-red-600 tabular-nums">{formatINR(data.totals.out)}</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs font-semibold text-ink-500">Net · {data.totals.count} entries</p>
            <p className={cn("text-lg font-bold tabular-nums", data.totals.net < 0 ? "text-red-600" : "text-ink-900")}>{formatINR(data.totals.net)}</p>
          </Card>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.rows}
        rowKey={(r) => r.key}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: BookOpenText, title: "No entries match", description: "Try a wider date range or clear a filter." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 50}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => { const next = new URLSearchParams(prev); next.set("page", String(p)); return next; })}
      />

      <RecordEntryDialog open={Boolean(recording)} onClose={() => setRecording(null)} preset={recording ?? undefined} />
      <ReverseDialog row={cancelling} onClose={() => setCancelling(null)} />
    </>
  );
}
