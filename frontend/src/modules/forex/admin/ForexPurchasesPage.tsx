import { PAYMENT_METHOD_LABELS, type ForexPurchaseRow } from "@mashkoor/shared";
import { PackagePlus, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useForexOverview, useForexPurchases } from "../api";
import { CancelDialog, PurchaseDialog } from "./ForexDialogs";

const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Foreign currency bought from dealers: the stock the desk has to sell. */
export function ForexPurchasesPage() {
  const ability = useAbility("admin");
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const status = (params.get("status") ?? "active") as "active" | "cancelled" | "all";
  const { data, isLoading, error } = useForexPurchases({ page, status });
  const { data: overview } = useForexOverview();
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<ForexPurchaseRow | null>(null);

  const columns: Column<ForexPurchaseRow>[] = [
    { key: "date", header: "Date", cell: (p) => <span className="whitespace-nowrap">{formatDate(p.purchaseDate)}</span> },
    {
      key: "dealer",
      header: "Dealer",
      cell: (p) => (
        <div>
          <p className="font-semibold">{p.supplier}</p>
          <p className="text-xs text-ink-500">{[p.reference && `Ref ${p.reference}`, p.createdBy && `by ${p.createdBy}`].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      ),
    },
    {
      key: "what",
      header: "Bought",
      cell: (p) => (
        <div className={cn(p.cancelledAt && "opacity-50 line-through")}>
          <p className="font-semibold tabular-nums">
            {num(p.foreignAmount)} {p.currency}
          </p>
          <p className="text-xs text-ink-500">at ₹{num(p.rate)}</p>
        </div>
      ),
    },
    {
      key: "inr",
      header: "Paid",
      className: "text-right",
      cell: (p) => (
        <div className={cn("tabular-nums", p.cancelledAt && "opacity-50 line-through")}>
          <p className="font-semibold text-red-600">−{formatINR(p.inrAmount)}</p>
          <p className="text-xs text-ink-500">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "",
      cell: (p) => (
        <span className="flex items-center justify-end gap-2">
          {p.cancelledAt && (
            <span title={p.cancelReason ?? undefined}>
              <Badge tone="red">Cancelled</Badge>
            </span>
          )}
          {!p.cancelledAt && ability.can("update", "ForexTransaction") && (
            <button type="button" title="Cancel this purchase" aria-label={`Cancel purchase of ${p.currency} from ${p.supplier}`} className="rounded-lg p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600" onClick={() => setCancelling(p)}>
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
        title="Dealer purchases"
        description="Currency bought from dealers to sell at the counter"
        actions={
          ability.can("create", "ForexTransaction") && (
            <Button onClick={() => setCreating(true)} disabled={!overview || overview.positions.length === 0}>
              <Plus className="h-4 w-4" aria-hidden /> Buy stock
            </Button>
          )
        }
      >
        <select
          className={inputClass}
          aria-label="Status"
          value={status}
          onChange={(e) =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              if (e.target.value === "active") next.delete("status");
              else next.set("status", e.target.value);
              next.delete("page");
              return next;
            })
          }
        >
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
      </PageHeader>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(p) => p.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: PackagePlus, title: "No purchases yet", description: "Record the currency you buy from a dealer and it becomes stock you can sell." }}
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

      <PurchaseDialog open={creating} onClose={() => setCreating(false)} positions={overview?.positions ?? []} />
      <CancelDialog target={cancelling ? { kind: "purchase", id: cancelling.id, label: `${num(cancelling.foreignAmount)} ${cancelling.currency} from ${cancelling.supplier}` } : null} onClose={() => setCancelling(null)} />
    </>
  );
}
