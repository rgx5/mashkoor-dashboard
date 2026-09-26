import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "./cn";

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          type="button"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition",
            tab.value === value ? "border-plum-600 text-plum-700" : "border-transparent text-ink-500 hover:text-ink-900",
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className={cn("rounded-full px-1.5 text-xs", tab.value === value ? "bg-plum-100 text-plum-700" : "bg-surface text-ink-500")}>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string; icon?: ReactNode }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition", o.value === value ? "bg-plum-600 text-white" : "text-ink-700 hover:bg-surface")}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-plum-700">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {children}
    </Link>
  );
}

/** Label/value pairs in detail panels. */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{item.label}</dt>
          <dd className="mt-1 text-sm text-ink-900">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum-100 text-xs font-bold text-plum-700", className)}>{letters}</span>;
}
