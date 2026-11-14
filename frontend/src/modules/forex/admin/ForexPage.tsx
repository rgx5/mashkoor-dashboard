import { FOREX_FORM_LABELS, FOREX_TYPE_LABELS, FOREX_TYPES, PAYMENT_METHOD_LABELS, type ForexPosition, type ForexPurchaseRow, type ForexTransactionRow, type ForexType } from "@mashkoor/shared";
import { ArrowLeftRight, Banknote, HandCoins, PackagePlus, Pencil, Plus, TrendingUp, Undo2, Wallet } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatDateTime, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Tabs } from "@/core/ui/misc";
import { Spinner } from "@/core/ui/Spinner";
import { useForexOverview, useForexPurchases, useForexTransactions, useUpdateForexRates } from "../api";
import { CancelDialog, NewDealDialog, PurchaseDialog, type DealPreset } from "./ForexDialogs";

const num = (n: number, digits = 2) => n.toLocaleString("en-IN", { maximumFractionDigits: digits });
const rateText = (n: number | null) => (n == null ? "—" : `₹${num(n, 4)}`);

type Tab = "rates" | "deals" | "purchases";
type Draft = Record<string, { buy: string; sell: string }>;
type CancelTarget = { kind: "deal" | "purchase"; id: string; label: string };

function Tile({ label, value, hint, icon: Icon, tone }: { label: string; value: string; hint?: string; icon: typeof Banknote; tone: string }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <p className="text-xs font-semibold text-ink-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-ink-900 tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
      </div>
    </Card>
  );
}

/** The whole forex desk in one place: today's rates and stock, every customer deal, and every dealer purchase. */
export function ForexPage() {
  const ability = useAbility("admin");
  const canManage = ability.can("manage", "ForexTransaction");
  const canCreate = ability.can("create", "ForexTransaction");
  const canCancel = ability.can("update", "ForexTransaction");

  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "rates") as Tab;
  const setTab = (next: Tab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", next);
      return p;
    });

  const { data: overview, isLoading: overviewLoading, error: overviewError } = useForexOverview();
  const positions: ForexPosition[] = overview?.positions ?? [];

  // Shared across tabs: buying/selling currency, and cancelling a past deal or purchase.
  const [deal, setDeal] = useState<DealPreset | null>(null);
  const [buying, setBuying] = useState<string | null | undefined>(undefined);
  const [cancelling, setCancelling] = useState<CancelTarget | null>(null);

  // Rates & stock
  const [draft, setDraft] = useState<Draft | null>(null);
  const saveRates = useUpdateForexRates();
  const startEditing = () => setDraft(Object.fromEntries(positions.map((p) => [p.code, { buy: p.buyRate?.toString() ?? "", sell: p.sellRate?.toString() ?? "" }])));
  const changedRates = positions
    .filter((p) => draft?.[p.code] && (draft[p.code]!.buy !== (p.buyRate?.toString() ?? "") || draft[p.code]!.sell !== (p.sellRate?.toString() ?? "")))
    .map((p) => ({ code: p.code, buyRate: draft![p.code]!.buy === "" ? null : Number(draft![p.code]!.buy), sellRate: draft![p.code]!.sell === "" ? null : Number(draft![p.code]!.sell) }));
  const saveRateChanges = async () => {
    try {
      await saveRates.mutateAsync({ rates: changedRates });
      toast.success(`${changedRates.length} rate${changedRates.length > 1 ? "s" : ""} updated`);
      setDraft(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // Customer deals
  const [dealsPage, setDealsPage] = useState(1);
  const [dealsQuery, setDealsQuery] = useState("");
  const [dealsType, setDealsType] = useState<ForexType | "">("");
  const [dealsStatus, setDealsStatus] = useState<"active" | "cancelled" | "all">("active");
  const {
    data: deals,
    isLoading: dealsLoading,
    error: dealsError,
  } = useForexTransactions({ page: dealsPage, q: dealsQuery || undefined, type: dealsType || undefined, status: dealsStatus });

  // Dealer purchases
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [purchasesStatus, setPurchasesStatus] = useState<"active" | "cancelled" | "all">("active");
  const { data: purchases, isLoading: purchasesLoading, error: purchasesError } = useForexPurchases({ page: purchasesPage, status: purchasesStatus });

  const dealColumns: Column<ForexTransactionRow>[] = [
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
          {!t.cancelledAt && canCancel && (
            <button
              type="button"
              title="Cancel this deal"
              aria-label={`Cancel ${t.refNo}`}
              className="rounded-lg p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => setCancelling({ kind: "deal", id: t.id, label: `${t.refNo} · ${num(t.foreignAmount)} ${t.currency}` })}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </span>
      ),
    },
  ];

  const purchaseColumns: Column<ForexPurchaseRow>[] = [
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
          {!p.cancelledAt && canCancel && (
            <button
              type="button"
              title="Cancel this purchase"
              aria-label={`Cancel purchase of ${p.currency} from ${p.supplier}`}
              className="rounded-lg p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => setCancelling({ kind: "purchase", id: p.id, label: `${num(p.foreignAmount)} ${p.currency} from ${p.supplier}` })}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </span>
      ),
    },
  ];

  const actions =
    tab === "rates" ? (
      draft ? (
        <>
          <Button variant="secondary" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button onClick={saveRateChanges} loading={saveRates.isPending} disabled={changedRates.length === 0}>
            Save {changedRates.length > 0 ? `${changedRates.length} change${changedRates.length > 1 ? "s" : ""}` : "rates"}
          </Button>
        </>
      ) : (
        <>
          {canManage && (
            <Button variant="secondary" onClick={startEditing} disabled={positions.length === 0}>
              <Pencil className="h-4 w-4" aria-hidden /> Update rates
            </Button>
          )}
          {canCreate && (
            <>
              <Button variant="secondary" onClick={() => setBuying(null)} disabled={positions.length === 0}>
                <PackagePlus className="h-4 w-4" aria-hidden /> Buy stock
              </Button>
              <Button onClick={() => setDeal({})} disabled={positions.length === 0}>
                <Plus className="h-4 w-4" aria-hidden /> New deal
              </Button>
            </>
          )}
        </>
      )
    ) : tab === "deals" ? (
      canCreate && (
        <Button onClick={() => setDeal({})} disabled={positions.length === 0}>
          <Plus className="h-4 w-4" aria-hidden /> New deal
        </Button>
      )
    ) : (
      canCreate && (
        <Button onClick={() => setBuying(null)} disabled={positions.length === 0}>
          <PackagePlus className="h-4 w-4" aria-hidden /> Buy stock
        </Button>
      )
    );

  return (
    <>
      <PageHeader title="Forex" description="Rates and stock, customer deals, and dealer purchases, all in one place" />

      <div className="mb-4 flex flex-col gap-3 border-b border-line sm:flex-row sm:items-end sm:justify-between">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          className="border-b-0"
          tabs={[
            { value: "rates", label: "Rates & stock" },
            { value: "deals", label: "Customer deals" },
            { value: "purchases", label: "Dealer purchases" },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 pb-2 [&_select]:w-auto [&>input]:w-64">
          {tab === "deals" && (
          <>
            <input
              className={inputClass}
              type="search"
              placeholder="Search name, mobile, passport, ref…"
              aria-label="Search deals"
              value={dealsQuery}
              onChange={(e) => {
                setDealsQuery(e.target.value);
                setDealsPage(1);
              }}
            />
            <select
              className={inputClass}
              aria-label="Type"
              value={dealsType}
              onChange={(e) => {
                setDealsType(e.target.value as ForexType | "");
                setDealsPage(1);
              }}
            >
              <option value="">Sold and bought</option>
              {FOREX_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FOREX_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              aria-label="Status"
              value={dealsStatus}
              onChange={(e) => {
                setDealsStatus(e.target.value as typeof dealsStatus);
                setDealsPage(1);
              }}
            >
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </select>
          </>
        )}
        {tab === "purchases" && (
          <select
            className={inputClass}
            aria-label="Status"
            value={purchasesStatus}
            onChange={(e) => {
              setPurchasesStatus(e.target.value as typeof purchasesStatus);
              setPurchasesPage(1);
            }}
          >
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        )}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>

      {tab === "rates" &&
        (overviewLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : overviewError ? (
          <p className="py-10 text-center text-sm text-red-600">{errorMessage(overviewError)}</p>
        ) : (
          overview && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Tile label="Sold today" value={formatINR(overview.today.sales)} hint={`${overview.today.count} sale${overview.today.count === 1 ? "" : "s"}`} icon={HandCoins} tone="bg-emerald-50 text-emerald-700" />
                <Tile label="Sold this month" value={formatINR(overview.month.sales)} hint={`${overview.month.count} sale${overview.month.count === 1 ? "" : "s"}`} icon={Banknote} tone="bg-plum-50 text-plum-700" />
                <Tile label="Margin this month" value={formatINR(overview.month.margin)} hint="Sales over what the stock cost" icon={TrendingUp} tone="bg-gold-50 text-gold-700" />
                <Tile label="Stock value" value={formatINR(overview.stockValue)} hint="At what it cost you" icon={Wallet} tone="bg-surface text-ink-700" />
              </div>

              {positions.length === 0 ? (
                <EmptyState icon={Banknote} title="No currencies set up" description="Add a currency such as SAR or USD on the Currencies page, then set its buy and sell rates here." />
              ) : (
                <Card className="overflow-hidden">
                  {draft && <p className="border-b border-line bg-plum-50/50 px-5 py-2 text-xs text-ink-700">Type the buy and sell rate for each currency. Leave the sell rate empty to stop selling a currency at the counter.</p>}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
                        <tr>
                          <th scope="col" className="px-5 py-3 font-semibold">
                            Currency
                          </th>
                          <th scope="col" className="px-5 py-3 text-right font-semibold">
                            In stock
                          </th>
                          <th scope="col" className="px-5 py-3 text-right font-semibold">
                            Avg cost
                          </th>
                          <th scope="col" className="px-5 py-3 text-right font-semibold">
                            We buy at
                          </th>
                          <th scope="col" className="px-5 py-3 text-right font-semibold">
                            We sell at
                          </th>
                          <th scope="col" className="px-5 py-3 text-right font-semibold">
                            Margin / unit
                          </th>
                          <th scope="col" className="px-5 py-3 text-right font-semibold">
                            Stock value
                          </th>
                          <th scope="col" className="px-5 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {positions.map((p) => (
                          <tr key={p.code} className={cn(!p.offered && "opacity-70")}>
                            <td className="px-5 py-3">
                              <p className="flex items-center gap-2 font-semibold text-ink-900">
                                {p.code}
                                <span className="font-normal text-ink-500">· {p.name}</span>
                                {!p.offered && <Badge tone="neutral">Not sold</Badge>}
                              </p>
                            </td>
                            <td className={cn("px-5 py-3 text-right font-semibold tabular-nums", p.stock <= 0 && "text-red-600")}>
                              {p.symbol} {num(p.stock)}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">{rateText(p.avgCost)}</td>
                            {draft ? (
                              <>
                                <td className="px-5 py-3 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.0001"
                                    aria-label={`Buy rate for ${p.code}`}
                                    value={draft[p.code]?.buy ?? ""}
                                    onChange={(e) => setDraft({ ...draft, [p.code]: { buy: e.target.value, sell: draft[p.code]?.sell ?? "" } })}
                                    className={cn(inputClass, "ml-auto w-28 text-right")}
                                  />
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.0001"
                                    aria-label={`Sell rate for ${p.code}`}
                                    value={draft[p.code]?.sell ?? ""}
                                    onChange={(e) => setDraft({ ...draft, [p.code]: { buy: draft[p.code]?.buy ?? "", sell: e.target.value } })}
                                    className={cn(inputClass, "ml-auto w-28 text-right")}
                                  />
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-5 py-3 text-right tabular-nums">{rateText(p.buyRate)}</td>
                                <td className="px-5 py-3 text-right font-semibold tabular-nums">{rateText(p.sellRate)}</td>
                              </>
                            )}
                            <td className={cn("px-5 py-3 text-right tabular-nums", p.marginPerUnit != null && p.marginPerUnit < 0 && "text-red-600")}>{p.marginPerUnit == null ? "—" : `₹${num(p.marginPerUnit, 4)}`}</td>
                            <td className="px-5 py-3 text-right tabular-nums">{formatINR(p.stockValue)}</td>
                            <td className="px-5 py-3 text-right">
                              {canCreate && !draft && (
                                <span className="flex justify-end gap-1.5">
                                  <Button size="sm" variant="secondary" onClick={() => setBuying(p.code)}>
                                    Buy stock
                                  </Button>
                                  <Button size="sm" disabled={!p.offered || p.stock <= 0} onClick={() => setDeal({ type: "SELL", currency: p.code })}>
                                    Sell
                                  </Button>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
              <p className="text-xs text-ink-500">Stock is every dealer purchase and buy-back less every sale, so it always matches the deals on record. The average cost is what the stock cost you per unit, and it is used to work out each sale's margin.</p>
            </div>
          )
        ))}

      {tab === "deals" && (
        <DataTable
          columns={dealColumns}
          rows={deals?.data}
          rowKey={(t) => t.id}
          loading={dealsLoading}
          error={dealsError ? errorMessage(dealsError) : null}
          empty={{ icon: ArrowLeftRight, title: "No deals yet", description: "Record a sale and it appears here, and on the Accounts ledger." }}
          page={dealsPage}
          pageSize={deals?.meta.pageSize ?? 25}
          total={deals?.meta.total ?? 0}
          onPageChange={setDealsPage}
        />
      )}

      {tab === "purchases" && (
        <DataTable
          columns={purchaseColumns}
          rows={purchases?.data}
          rowKey={(p) => p.id}
          loading={purchasesLoading}
          error={purchasesError ? errorMessage(purchasesError) : null}
          empty={{ icon: PackagePlus, title: "No purchases yet", description: "Record the currency you buy from a dealer and it becomes stock you can sell." }}
          page={purchasesPage}
          pageSize={purchases?.meta.pageSize ?? 25}
          total={purchases?.meta.total ?? 0}
          onPageChange={setPurchasesPage}
        />
      )}

      <NewDealDialog open={deal !== null} onClose={() => setDeal(null)} positions={positions} preset={deal ?? undefined} />
      <PurchaseDialog open={buying !== undefined} onClose={() => setBuying(undefined)} positions={positions} currency={buying ?? undefined} />
      <CancelDialog target={cancelling} onClose={() => setCancelling(null)} />
    </>
  );
}
