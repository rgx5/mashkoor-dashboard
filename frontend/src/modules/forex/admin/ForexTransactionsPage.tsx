import { FOREX_FORM_LABELS, FOREX_TYPE_LABELS, FOREX_TYPES, PAYMENT_METHOD_LABELS, type ForexTransactionRow, type ForexType } from "@mashkoor/shared";
import { ArrowLeftRight, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDateTime, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useForexOverview, useForexTransactions } from "../api";
import { CancelDialog, NewDealDialog } from "./ForexDialogs";

const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Every deal at the counter: who bought or sold what, at what rate, for how many rupees, and the margin on each sale. */
export function ForexTransactionsPage() {
  const ability = useAbility("admin");
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";
  const type = (params.get("type") ?? "") as ForexType | "";
  const status = (params.get("status") ?? "active") as "active" | "cancelled" | "all";
  const { data, isLoading, error } = useForexTransactions({ page, q: q || undefined, type: type || undefined, status });
  const { data: overview } = useForexOverview();
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<ForexTransactionRow | null>(null);

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });

  const columns: Column<ForexTransactionRow>[] = [
    {
      key: "deal",
      header: "Deal",
      cell: (t) => (
        <div>
          <p className="font-mono text-xs text-ink-700">{t.refNo}</p>
          <p className="text-xs text-ink-500">{formatDateTime(t.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (t) => (
        <div>
          {t.customer ? (
            <Link to={`/admin/customers/${t.customer.id}`} className="font-semibold text-plum-700 hover:underline">
              {t.customerName}
            </Link>
          ) : (
            <span className="font-semibold">{t.customerName}</span>
          )}
          <p className="text-xs text-ink-500">{[t.phone, t.passportNo && `Passport ${t.passportNo}`].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    {
      key: "what",
      header: "Currency",
      cell: (t) => (
        <div className={cn(t.cancelledAt && "opacity-50 line-through")}>
          <p className="font-semibold tabular-nums">
            {t.type === "SELL" ? "Sold" : "Bought"} {num(t.foreignAmount)} {t.currency}
          </p>
          <p className="text-xs text-ink-500">
            at ₹{num(t.rate)} · {FOREX_FORM_LABELS[t.form]}
          </p>
        </div>
      ),
    },
    {
      key: "inr",
      header: "Rupees",
      className: "text-right",
      cell: (t) => (
        <div className={cn("tabular-nums", t.cancelledAt && "opacity-50 line-through")}>
          <p className={cn("font-semibold", t.type === "SELL" ? "text-emerald-700" : "text-red-600")}>
            {t.type === "SELL" ? "+" : "−"}
            {formatINR(t.inrAmount)}
          </p>
          <p className="text-xs text-ink-500">{PAYMENT_METHOD_LABELS[t.paymentMethod]}</p>
        </div>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      className: "text-right",
      cell: (t) => (t.margin == null ? <span className="text-ink-300">—</span> : <span className={cn("font-semibold tabular-nums", t.margin < 0 && "text-red-600")}>{formatINR(t.margin)}</span>),
    },
    {
      key: "status",
      header: "",
      cell: (t) => (
        <span className="flex items-center justify-end gap-2">
          {t.cancelledAt && (
            <span title={t.cancelReason ?? undefined}>
              <Badge tone="red">Cancelled</Badge>
            </span>
          )}
          {!t.cancelledAt && ability.can("update", "ForexTransaction") && (
            <button type="button" title="Cancel this deal" aria-label={`Cancel ${t.refNo}`} className="rounded-lg p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600" onClick={() => setCancelling(t)}>
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
        title="Customer deals"
        description="Currency sold to and bought from customers"
        actions={
          ability.can("create", "ForexTransaction") && (
            <Button onClick={() => setCreating(true)} disabled={!overview || overview.positions.length === 0}>
              <Plus className="h-4 w-4" aria-hidden /> New deal
            </Button>
          )
        }
      >
        <input className={inputClass} type="search" placeholder="Search name, mobile, passport, ref…" aria-label="Search deals" defaultValue={q} onChange={(e) => set("q", e.target.value)} />
        <select className={inputClass} aria-label="Type" value={type} onChange={(e) => set("type", e.target.value)}>
          <option value="">Sold and bought</option>
          {FOREX_TYPES.map((t) => (
            <option key={t} value={t}>
              {FOREX_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select className={inputClass} aria-label="Status" value={status} onChange={(e) => set("status", e.target.value === "active" ? "" : e.target.value)}>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
      </PageHeader>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(t) => t.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: ArrowLeftRight, title: "No deals yet", description: "Record a sale and it appears here, and on the Accounts ledger." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) =>
          setParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("page", String(p));
            return next;
          })
        }
      />

      <NewDealDialog open={creating} onClose={() => setCreating(false)} positions={overview?.positions ?? []} />
      <CancelDialog target={cancelling ? { kind: "deal", id: cancelling.id, label: `${cancelling.refNo} · ${num(cancelling.foreignAmount)} ${cancelling.currency}` } : null} onClose={() => setCancelling(null)} />
    </>
  );
}
