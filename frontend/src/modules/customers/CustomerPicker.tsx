import { Search, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { Field, inputClass } from "@/core/ui/form";
import { useCustomer, useCustomers } from "./api";

/** Search-and-pick a customer by name, mobile or MKC number. `value` is the customer id (or empty). */
export function CustomerPicker({ value, onChange, label = "Customer", required, hint }: { value: string; onChange: (id: string) => void; label?: string; required?: boolean; hint?: string }) {
  const [query, setQuery] = useState("");
  const { data: results } = useCustomers({ page: 1, q: query }, query.length >= 2);
  const { data: customer } = useCustomer(value);

  return (
    <Field label={label} required={required} hint={hint}>
      {value && customer ? (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
          <span className="flex items-center gap-2 text-sm text-emerald-800">
            <UserRoundCheck className="h-4 w-4" aria-hidden />
            <strong>{customer.fullName}</strong> · {customer.refNo}
          </span>
          <button type="button" className="text-xs font-semibold text-emerald-700 underline" onClick={() => onChange("")}>
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
          <input className={`${inputClass} pl-9`} placeholder="Search by name, mobile or MKC number" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results && results.data.length > 0 && (
            <div className="mt-1 max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white shadow-md">
              {results.data.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-plum-50"
                  onClick={() => {
                    onChange(c.id);
                    setQuery("");
                  }}
                >
                  <strong>{c.fullName}</strong> <span className="text-ink-500">· {c.refNo} · {c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
