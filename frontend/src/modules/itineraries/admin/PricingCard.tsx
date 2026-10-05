import { BASE_CURRENCY, ITINERARY_LINE_KIND_LABELS, ITINERARY_LINE_KINDS, itineraryTotal, type CurrencyRow, type ItineraryLine, type ItineraryLineKind, type ProductType } from "@mashkoor/shared";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { inputClass } from "@/core/ui/form";
import { Card } from "@/core/ui/layout";
import { KIND_ICON, KIND_TONE, LineItem } from "./LineItem";

/**
 * The priced lines of a quotation or an invoice: collapsible line cards (type, details, quantity, price, currency, discount, tax),
 * a bar to add a line of any type, and the subtotal, adjustment and grand total. Both documents are edited with this one component.
 */
export function PricingCard({
  lines,
  adjustment,
  canEdit,
  productType,
  currencies,
  badLines,
  onClearBad,
  onChange,
  emptyHint = "Each line becomes a booking item if the customer accepts.",
}: {
  lines: ItineraryLine[];
  adjustment: number;
  canEdit: boolean;
  productType: ProductType;
  currencies: CurrencyRow[];
  badLines: Set<number>;
  onClearBad: () => void;
  onChange: (changes: { lines?: ItineraryLine[]; adjustment?: number }) => void;
  emptyHint?: string;
}) {
  /** Which lines are open for editing, by position. Saved documents start with every line collapsed. */
  const [openLines, setOpenLines] = useState<Set<number>>(new Set());
  const subtotal = itineraryTotal(lines, 0);
  const total = itineraryTotal(lines, adjustment);

  // A save that failed on certain lines opens them, so the problem is in front of you.
  useEffect(() => {
    if (badLines.size > 0) setOpenLines((prev) => new Set([...prev, ...badLines]));
  }, [badLines]);

  const setLine = (i: number, changes: Partial<ItineraryLine>) => onChange({ lines: lines.map((l, n) => (n === i ? { ...l, ...changes } : l)) });

  /** Rebuilds the line list from old positions, keeping each line's open state with it; `extra` lines are appended. */
  const reorderLines = (order: number[], extra: ItineraryLine[] = [], openNew = false) => {
    const next = [...order.map((o) => lines[o]!), ...extra];
    const open = new Set<number>(order.flatMap((o, n) => (openLines.has(o) ? [n] : [])));
    if (openNew) extra.forEach((_, k) => open.add(order.length + k));
    onChange({ lines: next });
    setOpenLines(open);
    onClearBad();
  };
  const addLine = (kind: ItineraryLineKind) =>
    reorderLines(lines.map((_, n) => n), [{ kind, description: "", detail: null, quantity: 1, unitPrice: 0, currency: BASE_CURRENCY, foreignAmount: null, fxRate: null, discount: 0, taxPercent: 0 }], true);
  const duplicateLine = (i: number) => {
    const order = lines.map((_, n) => n);
    order.splice(i + 1, 0, i);
    reorderLines(order);
    setOpenLines((prev) => new Set([...prev, i + 1]));
  };
  const moveLine = (i: number, by: -1 | 1) => {
    const order = lines.map((_, n) => n);
    [order[i], order[i + by]] = [order[i + by]!, order[i]!];
    reorderLines(order);
  };

  return (
  <Card className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">Pricing</h2>
        <p className="text-xs text-ink-500">
          {lines.length === 0 ? emptyHint : `${lines.length} line${lines.length > 1 ? "s" : ""} · ${formatINR(subtotal)}`}
        </p>
      </div>
      {lines.length > 1 && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setOpenLines(new Set(lines.map((_, n) => n)))}>
            <ChevronsUpDown className="h-4 w-4" aria-hidden /> Expand all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setOpenLines(new Set())}>
            <ChevronsDownUp className="h-4 w-4" aria-hidden /> Collapse all
          </Button>
        </div>
      )}
    </div>
    <datalist id="line-presets">
      <option value="Laundry" />
      <option value="Zamzam" />
      <option value="Travel insurance" />
      <option value="Ziyarat" />
    </datalist>
    {lines.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-500">No lines yet. Add a flight, hotel or anything else below.</p>}
    <ul className="mt-4 space-y-3">
      {lines.map((l, i) => (
        <LineItem
          key={i}
          index={i}
          count={lines.length}
          line={l}
          open={openLines.has(i)}
          bad={badLines.has(i)}
          canEdit={canEdit}
          productType={productType}
          currencies={currencies}
          onToggle={() => setOpenLines((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; })}
          onChange={(changes) => setLine(i, changes)}
          onRemove={() => reorderLines(lines.map((_, n) => n).filter((n) => n !== i))}
          onDuplicate={() => duplicateLine(i)}
          onMove={(by) => moveLine(i, by)}
        />
      ))}
    </ul>
    {canEdit && (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-plum-300 bg-plum-50/40 p-3">
        <span className="mr-1 text-sm font-semibold text-ink-700">Add a line</span>
        {ITINERARY_LINE_KINDS.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button key={k} type="button" onClick={() => addLine(k)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition hover:shadow-sm ${KIND_TONE[k]}`}>
              <Icon className="h-4 w-4" aria-hidden /> {ITINERARY_LINE_KIND_LABELS[k]}
            </button>
          );
        })}
      </div>
    )}
    <div className="mt-4 ml-auto max-w-sm space-y-2 rounded-xl border border-line bg-surface/60 p-4 text-sm">
      <p className="flex justify-between text-ink-700">
        <span>Subtotal</span>
        <span className="font-semibold">{formatINR(subtotal)}</span>
      </p>
      <label className="flex items-center justify-between gap-3 text-ink-700">
        <span>
          Adjustment (₹)
          <span className="block text-xs text-ink-500">Negative for a discount</span>
        </span>
        <input aria-label="Adjustment" type="number" className={`${inputClass} w-32 text-right`} disabled={!canEdit} value={adjustment} onChange={(e) => onChange({ adjustment: Number(e.target.value) })} />
      </label>
      <p className="flex justify-between border-t border-line pt-2 text-lg font-semibold text-ink-900">
        <span>Grand total</span>
        <span>{formatINR(total)}</span>
      </p>
    </div>
  </Card>
  );
}
