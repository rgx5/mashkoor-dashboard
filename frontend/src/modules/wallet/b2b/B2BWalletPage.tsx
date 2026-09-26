import { WALLET_CREDIT_TYPES, WALLET_ENTRY_TYPE_LABELS } from "@mashkoor/shared";
import { Download, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatDateTime, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { FullPageSpinner, Spinner } from "@/core/ui/Spinner";
import { exportWalletStatement, useWalletLedger, useWalletSummary } from "../api";

export function B2BWalletPage() {
  const { data: summary, isLoading } = useWalletSummary("b2b");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { data: ledger, isLoading: ledgerLoading } = useWalletLedger("b2b", page);

  if (isLoading) return <FullPageSpinner />;

  return (
    <>
      <PageHeader title="Wallet" description="Your balance and credit with Mashkoor." />
      <Card className="mb-6 flex flex-wrap gap-8 p-6">
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase">Balance</p>
          <p className={cn("text-3xl font-bold", (summary?.balance ?? 0) < 0 && "text-red-600")}>{formatINR(summary?.balance ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase">Credit limit</p>
          <p className="text-3xl font-bold">{formatINR(summary?.creditLimit ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase">Available to spend</p>
          <p className="text-3xl font-bold text-emerald-700">{formatINR(summary?.available ?? 0)}</p>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4" aria-hidden /> Statement
          </h2>
          <Button
            variant="secondary"
            size="sm"
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await exportWalletStatement("b2b");
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setExporting(false);
              }
            }}
          >
            <Download className="h-4 w-4" aria-hidden /> Download CSV
          </Button>
        </div>
        {ledgerLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {!ledgerLoading && ledger?.data.length === 0 && <EmptyState icon={Wallet} title="No transactions yet" />}
        <ul className="divide-y divide-line">
          {ledger?.data.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">{WALLET_ENTRY_TYPE_LABELS[e.type]}</span>
                {e.note && <span className="ml-2 text-ink-500">{e.note}</span>}
                <span className="block text-xs text-ink-500">{formatDateTime(e.createdAt)}</span>
              </span>
              <span className={cn("font-semibold", WALLET_CREDIT_TYPES.has(e.type) ? "text-emerald-700" : "text-red-600")}>
                {WALLET_CREDIT_TYPES.has(e.type) ? "+" : "−"}
                {formatINR(e.amount)}
              </span>
            </li>
          ))}
        </ul>
        {ledger && ledger.meta.total > ledger.meta.pageSize && (
          <div className="flex justify-end gap-1 border-t border-line p-3">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="ghost" size="sm" disabled={page * ledger.meta.pageSize >= ledger.meta.total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
