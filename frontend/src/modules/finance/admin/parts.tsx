import { LEDGER_KIND_LABELS, type LedgerRow } from "@mashkoor/shared";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { inputClass } from "@/core/ui/form";
import { PRESETS } from "@/modules/reports/shared";

/** From / to dates with the usual quick ranges. */
export function RangeBar({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} className={`${inputClass} w-40`} />
      <span className="text-sm text-ink-500">to</span>
      <input type="date" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && onChange(from, e.target.value)} className={`${inputClass} w-40`} />
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const [f, t] = p.range();
          const active = f === from && t === to;
          return (
            <button key={p.label} type="button" onClick={() => onChange(f, t)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", active ? "border-plum-600 bg-plum-600 text-white" : "border-line bg-white text-ink-700 hover:border-plum-300 hover:text-plum-700")}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** An arrow in the direction the money moved, in green for in and red for out. */
export function DirectionIcon({ direction }: { direction: "IN" | "OUT" }) {
  const Icon = direction === "IN" ? ArrowDownLeft : ArrowUpRight;
  return (
    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", direction === "IN" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")} title={direction === "IN" ? "Money in" : "Money out"}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

export const kindLabel = (row: Pick<LedgerRow, "kind">) => LEDGER_KIND_LABELS[row.kind];

/** The first of this month to today — the default window for every accounts screen. */
export const defaultRange = () => {
  const today = new Date().toISOString().slice(0, 10);
  return { from: `${today.slice(0, 8)}01`, to: today };
};
