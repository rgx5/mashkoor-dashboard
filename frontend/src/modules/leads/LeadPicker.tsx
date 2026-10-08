import type { LeadRow } from "@mashkoor/shared";
import { Search, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { Field, inputClass } from "@/core/ui/form";
import { useLead, useLeads } from "./api";

/** Search-and-pick a lead by name, mobile or MKL number. `value` is the lead id (or empty). */
export function LeadPicker({ value, onChange, label = "Lead", hint }: { value: string; onChange: (lead: LeadRow | null) => void; label?: string; hint?: string }) {
  const [query, setQuery] = useState("");
  const { data: results } = useLeads({ q: query }, query.length >= 2);
  const { data: lead } = useLead(value);

  return (
    <Field label={label} hint={hint}>
      {value && lead ? (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
          <span className="flex items-center gap-2 text-sm text-emerald-800">
            <UserRoundCheck className="h-4 w-4" aria-hidden />
            <strong>{lead.contactName}</strong> · {lead.refNo}
          </span>
          <button type="button" className="text-xs font-semibold text-emerald-700 underline" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
          <input className={`${inputClass} pl-9`} placeholder="Search by name, mobile or lead number" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query.length >= 2 && results && (
            <div className="mt-1 max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white shadow-md">
              {results.data.length === 0 && <p className="px-3 py-2 text-sm text-ink-500">No leads match "{query}".</p>}
              {results.data.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-plum-50"
                  onClick={() => {
                    onChange(l);
                    setQuery("");
                  }}
                >
                  <strong>{l.contactName}</strong> <span className="text-ink-500">· {l.refNo} · {l.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
