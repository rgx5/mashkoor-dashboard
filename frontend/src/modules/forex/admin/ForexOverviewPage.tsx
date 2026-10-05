import type { ForexPosition } from "@mashkoor/shared";
import { Banknote, HandCoins, PackagePlus, Pencil, Plus, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { inputClass } from "@/core/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useForexOverview, useUpdateForexRates } from "../api";
import { NewDealDialog, PurchaseDialog, type DealPreset } from "./ForexDialogs";

const num = (n: number, digits = 2) => n.toLocaleString("en-IN", { maximumFractionDigits: digits });
const rateText = (n: number | null) => (n == null ? "—" : `₹${num(n, 4)}`);

type Draft = Record<string, { buy: string; sell: string }>;

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

/** The forex desk at a glance: today's and this month's sales and margin, and for every currency its stock, cost and rates. */
export function ForexOverviewPage() {
  const ability = useAbility("admin");
  const canManage = ability.can("manage", "ForexTransaction");
  const canCreate = ability.can("create", "ForexTransaction");
  const { data, isLoading, error } = useForexOverview();
  const save = useUpdateForexRates();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deal, setDeal] = useState<DealPreset | null>(null);
  const [buying, setBuying] = useState<string | null | undefined>(undefined);

  const startEditing = () => setDraft(Object.fromEntries((data?.positions ?? []).map((p) => [p.code, { buy: p.buyRate?.toString() ?? "", sell: p.sellRate?.toString() ?? "" }])));
  const changedRates = (data?.positions ?? [])
    .filter((p) => draft?.[p.code] && (draft[p.code]!.buy !== (p.buyRate?.toString() ?? "") || draft[p.code]!.sell !== (p.sellRate?.toString() ?? "")))
    .map((p) => ({ code: p.code, buyRate: draft![p.code]!.buy === "" ? null : Number(draft![p.code]!.buy), sellRate: draft![p.code]!.sell === "" ? null : Number(draft![p.code]!.sell) }));

  const saveRates = async () => {
    try {
      await save.mutateAsync({ rates: changedRates });
      toast.success(`${changedRates.length} rate${changedRates.length > 1 ? "s" : ""} updated`);
      setDraft(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const positions: ForexPosition[] = data?.positions ?? [];

  return (
    <>
      <PageHeader
        title="Forex desk"
        description="Your buy and sell rates, and the stock you hold"
        actions={
          draft ? (
            <>
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={saveRates} loading={save.isPending} disabled={changedRates.length === 0}>
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
        }
      />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {error && <p className="py-10 text-center text-sm text-red-600">{errorMessage(error)}</p>}

      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Sold today" value={formatINR(data.today.sales)} hint={`${data.today.count} sale${data.today.count === 1 ? "" : "s"}`} icon={HandCoins} tone="bg-emerald-50 text-emerald-700" />
            <Tile label="Sold this month" value={formatINR(data.month.sales)} hint={`${data.month.count} sale${data.month.count === 1 ? "" : "s"}`} icon={Banknote} tone="bg-plum-50 text-plum-700" />
            <Tile label="Margin this month" value={formatINR(data.month.margin)} hint="Sales over what the stock cost" icon={TrendingUp} tone="bg-gold-50 text-gold-700" />
            <Tile label="Stock value" value={formatINR(data.stockValue)} hint="At what it cost you" icon={Wallet} tone="bg-surface text-ink-700" />
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
                              <input type="number" min={0} step="0.0001" aria-label={`Buy rate for ${p.code}`} value={draft[p.code]?.buy ?? ""} onChange={(e) => setDraft({ ...draft, [p.code]: { buy: e.target.value, sell: draft[p.code]?.sell ?? "" } })} className={cn(inputClass, "ml-auto w-28 text-right")} />
                            </td>
                            <td className="px-5 py-3 text-right">
                              <input type="number" min={0} step="0.0001" aria-label={`Sell rate for ${p.code}`} value={draft[p.code]?.sell ?? ""} onChange={(e) => setDraft({ ...draft, [p.code]: { buy: draft[p.code]?.buy ?? "", sell: e.target.value } })} className={cn(inputClass, "ml-auto w-28 text-right")} />
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
      )}

      <NewDealDialog open={deal !== null} onClose={() => setDeal(null)} positions={positions} preset={deal ?? undefined} />
      <PurchaseDialog open={buying !== undefined} onClose={() => setBuying(undefined)} positions={positions} currency={buying ?? undefined} />
    </>
  );
}
