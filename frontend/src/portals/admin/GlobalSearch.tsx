import { formatPhone, LEAD_STAGE_LABELS, BOOKING_STATUS_LABELS, type BookingStatus, type LeadStage, type SearchResults } from "@mashkoor/shared";
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Luggage, Search, Target, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/core/api/client";
import { cn } from "@/core/ui/cn";
import { Spinner } from "@/core/ui/Spinner";

interface Hit {
  key: string;
  to: string;
  icon: typeof Users;
  title: string;
  detail: string;
}

const GROUP_LABELS = { customers: "Customers", leads: "Leads", bookings: "Bookings" } as const;

/** Header quick-find: type a name, mobile, email or reference number. Ctrl/⌘ + K focuses it. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = useQuery({ queryKey: ["admin", "search", debounced], queryFn: () => api("admin").get<SearchResults>("/search", { q: debounced }), enabled, staleTime: 15_000 });

  const groups = useMemo(() => {
    if (!data) return [] as { label: string; hits: Hit[] }[];
    return [
      { label: GROUP_LABELS.customers, hits: data.customers.map((c): Hit => ({ key: `c${c.id}`, to: `/admin/customers/${c.id}`, icon: Users, title: c.fullName, detail: `${c.refNo} · ${formatPhone(c.phone)}` })) },
      { label: GROUP_LABELS.leads, hits: data.leads.map((l): Hit => ({ key: `l${l.id}`, to: `/admin/leads/${l.id}`, icon: Target, title: l.contactName, detail: `${l.refNo} · ${formatPhone(l.phone)} · ${LEAD_STAGE_LABELS[l.stage as LeadStage] ?? l.stage}` })) },
      { label: GROUP_LABELS.bookings, hits: data.bookings.map((b): Hit => ({ key: `b${b.id}`, to: `/admin/bookings/${b.id}`, icon: Luggage, title: b.refNo, detail: `${b.customerName} · ${BOOKING_STATUS_LABELS[b.status as BookingStatus] ?? b.status}` })) },
    ].filter((g) => g.hits.length > 0);
  }, [data]);
  const flat = groups.flatMap((g) => g.hits);
  const noResults = enabled && !isFetching && data && flat.length === 0;

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    navigate(to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => Math.min(i + 1, flat.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)));
    else if (e.key === "Enter" && flat[active]) go(flat[active].to);
  };

  let index = -1;

  return (
    <div ref={rootRef} className="relative hidden w-64 sm:block xl:w-80">
      <label className="relative block">
        <span className="sr-only">Search customers, leads and bookings</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Name, mobile, email or ref…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && enabled}
          className="h-9 w-full rounded-lg border border-line bg-surface pr-16 pl-9 text-sm placeholder:text-ink-300 focus:border-plum-500 focus:bg-white focus:ring-3 focus:ring-plum-100 focus:outline-none"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-500 md:block">Ctrl K</kbd>
      </label>

      {open && enabled && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-xl" role="listbox">
          {isFetching && !data && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {groups.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-2 pt-2 pb-1 text-[11px] font-bold tracking-wider text-ink-500 uppercase">{group.label}</p>
              {group.hits.map((hit) => {
                index++;
                const i = index;
                return (
                  <button
                    key={hit.key}
                    type="button"
                    role="option"
                    aria-selected={active === i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit.to)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left", active === i ? "bg-plum-50" : "hover:bg-surface")}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-plum-50 text-plum-600">
                      <hit.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{hit.title}</span>
                      <span className="block truncate text-xs text-ink-500">{hit.detail}</span>
                    </span>
                    {active === i && <CornerDownLeft className="h-3.5 w-3.5 text-ink-300" aria-hidden />}
                  </button>
                );
              })}
            </div>
          ))}
          {noResults && (
            <div className="p-3 text-sm">
              <p className="text-ink-500">No one matches “{debounced}”.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => go("/admin/leads?new=1")} className="inline-flex items-center gap-1.5 rounded-lg bg-plum-50 px-3 py-1.5 text-xs font-semibold text-plum-700 hover:bg-plum-100">
                  <UserPlus className="h-3.5 w-3.5" aria-hidden /> New lead
                </button>
                <button type="button" onClick={() => go("/admin/customers?new=1")} className="inline-flex items-center gap-1.5 rounded-lg bg-plum-50 px-3 py-1.5 text-xs font-semibold text-plum-700 hover:bg-plum-100">
                  <Users className="h-3.5 w-3.5" aria-hidden /> New customer
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
