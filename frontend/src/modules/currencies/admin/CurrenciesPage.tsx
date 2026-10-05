import { zodResolver } from "@hookform/resolvers/zod";
import { BASE_CURRENCY, currencyInputSchema, type CurrencyRow } from "@mashkoor/shared";
import { ArrowDown, ArrowLeftRight, ArrowUp, History, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { z } from "zod";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { formatDateTime } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, Field, FormError, inputClass, SelectField, TextField } from "@/core/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { CHART_COLORS } from "@/modules/reports/charts";
import { useCreateCurrency, useCurrencies, useCurrencyHistory, useDeleteCurrency, useUpdateCurrency, useUpdateRates } from "../api";

type FormIn = z.input<typeof currencyInputSchema>;
type FormOut = z.output<typeof currencyInputSchema>;

const rateText = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

/** Which way a rate last moved and by how much. Neutral colours: whether a rise is good depends on whether you are buying or selling. */
function Change({ rate, previous }: { rate: number; previous: number | null }) {
  if (previous == null || previous === rate) return <span className="text-ink-300">—</span>;
  const pct = ((rate - previous) / previous) * 100;
  const Icon = pct > 0 ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink-700 tabular-nums" title={`Was ₹${rateText(previous)}`}>
      <Icon className={cn("h-3.5 w-3.5", pct > 0 ? "text-emerald-600" : "text-red-600")} aria-hidden />
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

/**
 * Currencies: every currency a quotation, hotel rate or transport price can be in, the reference rate to INR, how each last
 * moved, and who changed it. Rates can be typed one at a time or all at once ("Update rates"), and each currency's full history
 * is one click away. A rate only affects NEW prices — a quotation, hotel rate or transport price keeps the rate it was entered
 * at. (What customers pay at the forex desk is separate: see the Forex section.)
 */
export function CurrenciesPage() {
  const ability = useAbility("admin");
  const canManage = ability.can("manage", "Currency");
  const { data, isLoading, error } = useCurrencies();
  const [editing, setEditing] = useState<CurrencyRow | "new" | null>(null);
  const [history, setHistory] = useState<CurrencyRow | null>(null);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const update = useUpdateCurrency();
  const remove = useDeleteCurrency();
  const saveRates = useUpdateRates();

  const changed = useMemo(() => (draft && data ? data.filter((c) => draft[c.code] !== undefined && draft[c.code] !== "" && Number(draft[c.code]) !== c.rateToInr && Number(draft[c.code]) > 0) : []), [draft, data]);
  const lastUpdated = data?.reduce<string | null>((latest, c) => (latest === null || c.updatedAt > latest ? c.updatedAt : latest), null);

  const submitRates = async () => {
    try {
      await saveRates.mutateAsync({ rates: changed.map((c) => ({ code: c.code, rateToInr: Number(draft![c.code]) })) });
      toast.success(`${changed.length} rate${changed.length > 1 ? "s" : ""} updated`);
      setDraft(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Currencies"
        description="Reference rates to INR for pricing quotations, hotels and transport, with their history. A new rate only affects new prices — existing quotations keep the rate they were priced at."
        actions={
          canManage &&
          (draft ? (
            <>
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={submitRates} loading={saveRates.isPending} disabled={changed.length === 0}>
                Save {changed.length > 0 ? `${changed.length} rate${changed.length > 1 ? "s" : ""}` : "rates"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setDraft({})} disabled={!data || data.length <= 1}>
                <Pencil className="h-4 w-4" aria-hidden /> Update rates
              </Button>
              <Button onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" aria-hidden /> New currency
              </Button>
            </>
          ))
        }
      />

      {isLoading && (
        <div className="flex justify-center py-14">
          <Spinner />
        </div>
      )}
      {error && <p className="py-10 text-center text-sm text-red-600">{errorMessage(error)}</p>}
      {!isLoading && data?.length === 0 && <EmptyState icon={ArrowLeftRight} title="No currencies yet" description="INR is always available; add another to price in a supplier's own currency." />}

      {data && data.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-base font-semibold">Rates</h2>
              <p className="text-xs text-ink-500">{lastUpdated ? `Last change ${formatDateTime(lastUpdated)}` : ""}</p>
            </div>
            {draft && <p className="border-b border-line bg-plum-50/50 px-5 py-2 text-xs text-ink-700">Type the new rate for each currency that changed, then save. Rates you leave alone stay as they are.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Currency
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      Rate (₹ per 1)
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Last move
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Updated
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.map((c) => {
                    const isBase = c.code === BASE_CURRENCY;
                    const edited = draft?.[c.code] !== undefined && draft[c.code] !== "" && Number(draft[c.code]) !== c.rateToInr;
                    return (
                      <tr key={c.code} className={cn(!c.active && "opacity-60", edited && "bg-gold-50/60")}>
                        <td className="px-5 py-3">
                          <p className="flex items-center gap-2 font-semibold text-ink-900">
                            {c.code}
                            <span className="font-normal text-ink-500">· {c.name}</span>
                            {isBase && <Badge tone="plum">Base</Badge>}
                            {!c.active && <Badge tone="red">Off</Badge>}
                          </p>
                          <p className="text-xs text-ink-500">Symbol {c.symbol}</p>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {draft && !isBase ? (
                            <input
                              type="number"
                              min={0}
                              step="0.0001"
                              aria-label={`New rate for ${c.code}`}
                              placeholder={rateText(c.rateToInr)}
                              value={draft[c.code] ?? ""}
                              onChange={(e) => setDraft({ ...draft, [c.code]: e.target.value })}
                              className={cn(inputClass, "ml-auto w-32 text-right")}
                            />
                          ) : (
                            <span className="text-base font-semibold tabular-nums">₹{rateText(c.rateToInr)}</span>
                          )}
                        </td>
                        <td className="px-5 py-3">{isBase ? <span className="text-ink-300">—</span> : <Change rate={c.rateToInr} previous={c.previousRate} />}</td>
                        <td className="px-5 py-3 text-xs text-ink-500">
                          {isBase ? "—" : formatDateTime(c.updatedAt)}
                          {c.updatedBy && !isBase && <span className="block">by {c.updatedBy}</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className="flex items-center justify-end gap-1">
                            {!isBase && (
                              <Button variant="ghost" size="sm" aria-label={`Rate history for ${c.code}`} title="Rate history" onClick={() => setHistory(c)}>
                                <History className="h-4 w-4" aria-hidden />
                              </Button>
                            )}
                            {canManage && !draft && (
                              <>
                                {!isBase && (
                                  <button type="button" title={c.active ? "Switch off" : "Switch on"} onClick={() => withToast(update.mutateAsync({ code: c.code, input: { active: !c.active } }), c.active ? "Switched off" : "Switched on")}>
                                    <Badge tone={c.active ? "green" : "neutral"}>{c.active ? "On" : "Off"}</Badge>
                                  </button>
                                )}
                                <Button variant="ghost" size="sm" aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)}>
                                  <Pencil className="h-4 w-4" aria-hidden />
                                </Button>
                                {!isBase && (
                                  <Button variant="ghost" size="sm" aria-label={`Delete ${c.code}`} onClick={() => window.confirm(`Delete ${c.code}? Prices already entered in it keep their numbers.`) && withToast(remove.mutateAsync(c.code), "Currency deleted")}>
                                    <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                                  </Button>
                                )}
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Converter currencies={data} />
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? `Edit ${editing.code}` : "New currency"}>
        {editing !== null && <CurrencyForm currency={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <HistoryDialog currency={history} onClose={() => setHistory(null)} />
    </>
  );
}

/** Amount in one currency worked out in another, using the rates on this page. */
function Converter({ currencies }: { currencies: CurrencyRow[] }) {
  const active = currencies.filter((c) => c.active);
  const [amount, setAmount] = useState("1000");
  const [from, setFrom] = useState(active.find((c) => c.code !== BASE_CURRENCY)?.code ?? BASE_CURRENCY);
  const [to, setTo] = useState(BASE_CURRENCY);
  const rate = (code: string) => currencies.find((c) => c.code === code)?.rateToInr ?? 1;
  const perUnit = rate(from) / rate(to);
  const result = (Number(amount) || 0) * perUnit;
  const symbolOf = (code: string) => currencies.find((c) => c.code === code)?.symbol ?? code;

  return (
    <Card className="h-fit p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <ArrowLeftRight className="h-4 w-4 text-plum-700" aria-hidden /> Converter
      </h2>
      <div className="space-y-3">
        <Field label="Amount">
          <input type="number" min={0} className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <SelectField label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
            {active.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </SelectField>
          <button
            type="button"
            aria-label="Swap currencies"
            className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink-700 hover:bg-plum-50"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
          </button>
          <SelectField label="To" value={to} onChange={(e) => setTo(e.target.value)}>
            {active.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="rounded-xl bg-plum-50 px-4 py-3">
          <p className="text-xs text-ink-500">
            {symbolOf(from)} {rateText(Number(amount) || 0)} {from} =
          </p>
          <p className="text-2xl font-bold text-ink-900 tabular-nums">
            {symbolOf(to)} {result.toLocaleString("en-IN", { maximumFractionDigits: 2 })} <span className="text-base font-semibold text-ink-500">{to}</span>
          </p>
          <p className="mt-1 text-xs text-ink-500">
            1 {from} = {rateText(perUnit)} {to}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Every rate a currency has had: a line chart and the list of changes, newest first. */
function HistoryDialog({ currency, onClose }: { currency: CurrencyRow | null; onClose: () => void }) {
  const { data, isLoading } = useCurrencyHistory(currency?.code ?? null);
  const points = (data ?? []).map((l) => ({ label: dayFmt.format(new Date(l.createdAt)), rate: l.rate }));

  return (
    <Dialog open={Boolean(currency)} onClose={onClose} title={currency ? `${currency.code} rate history` : "Rate history"} description={currency ? `${currency.name} — ₹ per 1 ${currency.code}` : undefined} size="lg">
      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {data && data.length === 0 && <p className="py-8 text-center text-sm text-ink-500">No changes recorded yet.</p>}
      {data && data.length > 0 && (
        <div className="space-y-4">
          {points.length > 1 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip formatter={(v) => [`₹${rateText(Number(v))}`, "Rate"]} />
                  <Line type="stepAfter" dataKey="rate" stroke={CHART_COLORS.plum} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
            {[...data].reverse().map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-semibold tabular-nums">
                  {l.previousRate != null ? (
                    <>
                      ₹{rateText(l.previousRate)} <span className="text-ink-300">→</span> ₹{rateText(l.rate)}
                    </>
                  ) : (
                    <>₹{rateText(l.rate)} <span className="font-normal text-ink-500">(first rate)</span></>
                  )}
                </span>
                <span className="text-right text-xs text-ink-500">
                  {formatDateTime(l.createdAt)}
                  {l.changedBy && <span className="block">by {l.changedBy}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden /> Close
        </Button>
      </div>
    </Dialog>
  );
}

function CurrencyForm({ currency, onDone }: { currency?: CurrencyRow; onDone: () => void }) {
  const create = useCreateCurrency();
  const update = useUpdateCurrency();
  const [formError, setFormError] = useState<string | null>(null);
  const isBase = currency?.code === BASE_CURRENCY;
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(currencyInputSchema),
    defaultValues: currency ?? { active: true, rateToInr: 1 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (currency) await update.mutateAsync({ code: currency.code, input: values });
      else await create.mutateAsync(values);
      toast.success("Saved");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Code" hint="3 letters, e.g. SAR" required autoFocus disabled={Boolean(currency)} maxLength={3} error={formState.errors.code?.message} {...register("code")} />
        <TextField label="Symbol" hint="e.g. ﷼" required error={formState.errors.symbol?.message} {...register("symbol")} />
      </div>
      <TextField label="Name" required error={formState.errors.name?.message} {...register("name")} />
      <TextField label="Rate to INR" type="number" min={0} step="0.0001" required disabled={isBase} hint={isBase ? "INR is always rate 1" : "How many rupees equal 1 unit of this currency"} error={formState.errors.rateToInr?.message} {...register("rateToInr")} />
      <CheckboxField label="Active" disabled={isBase} {...register("active")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
