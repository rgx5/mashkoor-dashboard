import { BASE_CURRENCY, describeLine, ITINERARY_LINE_KIND_LABELS, ITINERARY_LINE_KINDS, lineMultiplier, lineTotal, ratedUnitPrice, type CurrencyRow, type ItineraryLine, type ItineraryLineKind, type ProductType } from "@mashkoor/shared";
import { AlertCircle, BedDouble, Bus, ChevronDown, Copy, FileCheck2, Package, Plane, Trash2, Utensils, type LucideIcon } from "lucide-react";
import { formatINR } from "@/core/format";
import { cn } from "@/core/ui/cn";
import { Field, inputClass } from "@/core/ui/form";
import { LineAttributes } from "./LineAttributes";

export const KIND_ICON: Record<ItineraryLineKind, LucideIcon> = { FLIGHT: Plane, HOTEL: BedDouble, MEALS: Utensils, TRANSPORT: Bus, VISA: FileCheck2, OTHER: Package };

/** One colour per kind so a long list can be scanned by eye. */
export const KIND_TONE: Record<ItineraryLineKind, string> = {
  FLIGHT: "bg-sky-50 text-sky-700 border-sky-200",
  HOTEL: "bg-plum-50 text-plum-700 border-plum-200",
  MEALS: "bg-amber-50 text-amber-700 border-amber-200",
  TRANSPORT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  VISA: "bg-indigo-50 text-indigo-700 border-indigo-200",
  OTHER: "bg-surface text-ink-700 border-line",
};

const iconButton = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-700 transition hover:bg-plum-50 disabled:opacity-40 disabled:hover:bg-white";

/** What is still missing on a line, in words — shown in the collapsed header so nothing is saved half-filled by accident. */
export function lineProblem(l: ItineraryLine): string | null {
  if (!l.description.trim()) return "Needs details";
  if (!l.unitPrice) return "No price";
  return null;
}

interface Props {
  index: number;
  count: number;
  line: ItineraryLine;
  open: boolean;
  bad: boolean;
  canEdit: boolean;
  productType: ProductType;
  currencies: CurrencyRow[];
  onToggle: () => void;
  onChange: (changes: Partial<ItineraryLine>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (by: -1 | 1) => void;
}

/**
 * A priced line on a quotation. Collapsed it is a single row — number, type, what it is, quantity × price, total — so a long
 * quotation can be scanned and reordered; opened it shows the fields grouped as Item, then Price.
 */
export function LineItem({ index, count, line: l, open, bad, canEdit, productType, currencies, onToggle, onChange: apply, onRemove, onDuplicate, onMove }: Props) {
  // A hotel or meals line priced per night / per day re-works its unit price whenever the rate or the length of stay changes.
  const onChange = (changes: Partial<ItineraryLine>) => {
    const merged = { ...l, ...changes };
    const rated = ratedUnitPrice(merged);
    apply(rated !== null && rated !== merged.unitPrice ? { ...changes, unitPrice: rated } : changes);
  };
  const kind = l.kind ?? "OTHER";
  const Icon = KIND_ICON[kind];
  const problem = lineProblem(l);
  const currency = l.currency ?? BASE_CURRENCY;
  const foreign = currency !== BASE_CURRENCY;
  const total = lineTotal(l);
  const rateable = kind === "HOTEL" || kind === "MEALS";
  const multiplier = lineMultiplier(kind, l.attrs);
  const rated = rateable && Boolean(l.attrs?.perUnit);
  const word = kind === "HOTEL" ? "night" : "day";
  const unitWord = kind === "HOTEL" ? "room" : "person";
  const setRated = (on: boolean) => {
    const attrs = { ...l.attrs, perUnit: on };
    // Switching on keeps the price already entered, spread over the stay, so nothing jumps.
    if (on && foreign === false && multiplier) attrs.rate = Math.round(l.unitPrice / multiplier);
    onChange({ attrs });
  };
  const recompute = (foreignAmount: number | null, fxRate: number | null) => onChange({ foreignAmount, fxRate, unitPrice: foreignAmount != null && fxRate ? Math.round(foreignAmount * fxRate) : 0 });

  return (
    <li className={cn("overflow-hidden rounded-xl border bg-white shadow-sm", bad ? "border-2 border-red-400" : open ? "border-plum-300" : "border-line")}>
      <div className={cn("flex items-center gap-2 px-3 py-2.5", open ? "bg-plum-50/60" : "hover:bg-surface")}>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} line ${index + 1}`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">{index + 1}</span>
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", KIND_TONE[kind])} title={ITINERARY_LINE_KIND_LABELS[kind]}>
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-semibold", l.description ? "text-ink-900" : "text-ink-300")}>{l.description || `New ${ITINERARY_LINE_KIND_LABELS[kind].toLowerCase()} line`}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
              <span>{ITINERARY_LINE_KIND_LABELS[kind]}</span>
              <span aria-hidden>·</span>
              <span>
                {l.quantity} × {formatINR(l.unitPrice)}
                {foreign && l.foreignAmount != null && <span className="text-ink-400"> ({currency} {l.foreignAmount})</span>}
              </span>
              {problem && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {problem}
                </span>
              )}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-base font-semibold text-ink-900">{formatINR(total)}</span>
            {((l.discount ?? 0) > 0 || (l.taxPercent ?? 0) > 0) && <span className="block text-[11px] text-ink-500">{(l.discount ?? 0) > 0 && `− ${formatINR(l.discount ?? 0)}`}{(l.discount ?? 0) > 0 && (l.taxPercent ?? 0) > 0 && " · "}{(l.taxPercent ?? 0) > 0 && `+${l.taxPercent}% tax`}</span>}
          </span>
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-ink-500 transition", open && "rotate-180")} aria-hidden />
        </button>
        {canEdit && (
          <span className="flex shrink-0 items-center gap-1 border-l border-line pl-2">
            <button type="button" className={iconButton} aria-label={`Move line ${index + 1} up`} title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
              <ChevronDown className="h-4 w-4 rotate-180" aria-hidden />
            </button>
            <button type="button" className={iconButton} aria-label={`Move line ${index + 1} down`} title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className={iconButton} aria-label={`Duplicate line ${index + 1}`} title="Duplicate" onClick={onDuplicate}>
              <Copy className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className={cn(iconButton, "text-red-600 hover:border-red-200 hover:bg-red-50")} aria-label={`Remove line ${index + 1}`} title="Remove" onClick={onRemove}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </span>
        )}
      </div>

      {open && (
        <div className="space-y-5 border-t border-line p-4">
          <section aria-label="Item" className="space-y-3">
            <h4 className="text-xs font-bold tracking-wide text-ink-500 uppercase">Item</h4>
            <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
              <Field label="Type">
                <select aria-label="Type" className={inputClass} disabled={!canEdit} value={kind} onChange={(e) => onChange({ kind: e.target.value as ItineraryLineKind, ...describeLine(e.target.value as ItineraryLineKind, l.attrs ?? {}) })}>
                  {ITINERARY_LINE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ITINERARY_LINE_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              {kind === "OTHER" && (
                <Field label="Description">
                  <input aria-label="Description" list="line-presets" className={inputClass} placeholder="e.g. Laundry, Zamzam, Insurance" disabled={!canEdit} value={l.description} onChange={(e) => onChange({ description: e.target.value })} />
                </Field>
              )}
            </div>
            <LineAttributes line={l} disabled={!canEdit} productType={productType} onChange={onChange} />
            {kind === "OTHER" && (
              <Field label="Details" hint="Printed under the line on the quotation">
                <textarea aria-label="Details" rows={3} className={inputClass} placeholder={"e.g.\n1. Air Ticket-Adult-Gulf Airlines Mum to Jed…\n2. Hotel-Triple-Voco Makkah, 16-Sep to 23-Sep, 7 nights"} disabled={!canEdit} value={l.detail ?? ""} onChange={(e) => onChange({ detail: e.target.value })} />
              </Field>
            )}
          </section>

          <section aria-label="Price" className="space-y-3 rounded-xl border border-line bg-surface/60 p-3.5">
            <h4 className="text-xs font-bold tracking-wide text-ink-500 uppercase">Price</h4>
            {rateable && (
              <label className="flex items-start gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-plum-600" disabled={!canEdit} checked={rated} onChange={(e) => setRated(e.target.checked)} />
                <span>
                  <span className="font-semibold">Price is per {word}</span>
                  <span className="block text-xs text-ink-500">
                    {rated
                      ? multiplier
                        ? `Rate × ${multiplier} ${word}${multiplier > 1 ? "s" : ""} = the price for one ${unitWord}. Change the dates or the number of ${word}s and it follows.`
                        : `Enter the ${kind === "HOTEL" ? "nights or the check-in and check-out dates" : "total days or the from and to dates"} above and the price will be worked out.`
                      : `Tick this to enter a rate per ${word} and have it multiplied by the ${kind === "HOTEL" ? "nights" : "total days"} for you.`}
                  </span>
                </span>
              </label>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Quantity">
                <input aria-label="Quantity" type="number" min={1} className={inputClass} disabled={!canEdit} value={l.quantity} onChange={(e) => onChange({ quantity: Number(e.target.value) })} />
              </Field>
              <Field label="Currency">
                <select
                  aria-label="Currency"
                  className={inputClass}
                  disabled={!canEdit}
                  value={currency}
                  onChange={(e) => {
                    const code = e.target.value;
                    if (code === BASE_CURRENCY) onChange({ currency: code, foreignAmount: null, fxRate: null });
                    else onChange({ currency: code, fxRate: currencies.find((c) => c.code === code)?.rateToInr ?? l.fxRate ?? 1 });
                  }}
                >
                  <option value={BASE_CURRENCY}>{BASE_CURRENCY}</option>
                  {currencies
                    .filter((c) => c.code !== BASE_CURRENCY)
                    .map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              {foreign ? (
                <>
                  <Field label={rated ? `Rate per ${word} (${currency})` : `Price per unit (${currency})`}>
                    <input aria-label={`Amount in ${currency}`} type="number" min={0} step="0.01" className={inputClass} disabled={!canEdit} value={l.foreignAmount ?? ""} onChange={(e) => recompute(e.target.value === "" ? null : Number(e.target.value), l.fxRate ?? 1)} />
                  </Field>
                  <Field label={`Rate (₹ per ${currency})`}>
                    <input aria-label="Exchange rate" type="number" min={0} step="0.0001" className={inputClass} disabled={!canEdit} value={l.fxRate ?? ""} onChange={(e) => recompute(l.foreignAmount ?? null, e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                </>
              ) : rated ? (
                <Field label={`Rate per ${word} (₹)`}>
                  <input aria-label={`Rate per ${word} (₹)`} type="number" min={0} className={inputClass} disabled={!canEdit} value={l.attrs?.rate ?? ""} onChange={(e) => onChange({ attrs: { ...l.attrs, rate: e.target.value === "" ? null : Number(e.target.value) } })} />
                </Field>
              ) : (
                <Field label="Price per unit (₹)">
                  <input aria-label="Unit price (₹)" type="number" min={0} className={inputClass} disabled={!canEdit} value={l.unitPrice} onChange={(e) => onChange({ unitPrice: Number(e.target.value) })} />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(foreign || rated) && (
                <Field label={rated ? `Price per ${unitWord}${multiplier ? ` for ${multiplier} ${word}${multiplier > 1 ? "s" : ""}` : ""} (₹)` : "Price per unit (₹)"} hint={rated ? "Worked out from the rate" : `${currency} × rate, rounded`}>
                  <input aria-label="Unit price (₹)" type="number" min={0} className={inputClass} disabled={!canEdit} readOnly={rated} value={l.unitPrice} onChange={(e) => onChange({ unitPrice: Number(e.target.value) })} />
                </Field>
              )}
              <Field label="Discount (₹)">
                <input aria-label="Discount" type="number" min={0} className={inputClass} disabled={!canEdit} value={l.discount ?? 0} onChange={(e) => onChange({ discount: Number(e.target.value) })} />
              </Field>
              <Field label="Tax (%)">
                <input aria-label="Tax percent" type="number" min={0} max={100} step="0.1" className={inputClass} disabled={!canEdit} value={l.taxPercent ?? 0} onChange={(e) => onChange({ taxPercent: Number(e.target.value) })} />
              </Field>
              <div className={cn("flex flex-col justify-end rounded-lg border border-plum-200 bg-white px-3.5 py-2", foreign || rated ? "" : "sm:col-start-4")}>
                <span className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Line total</span>
                <span className="text-lg font-semibold text-ink-900">{formatINR(total)}</span>
              </div>
            </div>
          </section>
        </div>
      )}
    </li>
  );
}
