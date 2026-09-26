import type { LucideIcon } from "lucide-react";
import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "./cn";

interface PageMeta {
  title: string;
  description?: string;
}
interface PageChrome {
  setMeta: (meta: PageMeta | null) => void;
  meta: PageMeta | null;
}
const PageChromeContext = createContext<PageChrome | null>(null);

/** Wrap a layout in this so every `PageHeader` below it shows its title in the layout's top bar instead of on the page. */
export function PageMetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

/** The current page's title/description, for the top bar. Null when a page hasn't set one. */
export const usePageMeta = () => useContext(PageChromeContext)?.meta ?? null;

/**
 * Pages declare their title here. Inside a `PageMetaProvider` the title moves to the top bar and only the actions stay on the page; elsewhere (B2B/B2C portals) it renders as a normal page heading.
 */
export function PageHeader({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children?: ReactNode }) {
  const chrome = useContext(PageChromeContext);
  const setMeta = chrome?.setMeta;
  useLayoutEffect(() => {
    if (!setMeta) return;
    setMeta({ title, description });
    return () => setMeta(null);
  }, [setMeta, title, description]);

  if (chrome) {
    if (!actions && !children) return null;
    // Filters (children) on the left and the page's buttons on the right, all on one line.
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 [&_select]:w-auto [&>input]:w-64">
        {children}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    );
  }
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-line bg-white", className)}>{children}</div>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-plum-50 text-plum-600">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-surface text-ink-700 ring-line",
  plum: "bg-plum-50 text-plum-700 ring-plum-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-gold-50 text-gold-700 ring-gold-100",
  red: "bg-red-50 text-red-700 ring-red-200",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", badgeTones[tone])}>{children}</span>;
}
