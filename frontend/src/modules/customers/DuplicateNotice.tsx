import { formatPhone } from "@mashkoor/shared";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";
import type { DuplicateMatch } from "./api";

/** Shown when a phone/email already belongs to a customer, so staff link instead of duplicating. */
export function DuplicateNotice({ matches, onUse, useLabel = "Use this customer" }: { matches: DuplicateMatch[]; onUse?: (match: DuplicateMatch) => void; useLabel?: string }) {
  if (!matches.length) return null;
  return (
    <div className="rounded-lg border border-gold-100 bg-gold-50 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-gold-700">
        <AlertTriangle className="h-4 w-4" aria-hidden /> Existing customer found
      </p>
      <ul className="mt-2 space-y-2">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <Link to={`/admin/customers/${m.id}`} target="_blank" className="font-semibold text-plum-700 hover:underline">
                {m.fullName}
              </Link>{" "}
              <span className="text-ink-500">
                · {m.refNo} · {formatPhone(m.phone)} {m.email ? `· ${m.email}` : ""} (same {m.matchedOn})
              </span>
            </span>
            {onUse && (
              <button type="button" onClick={() => onUse(m)} className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-plum-700 ring-1 ring-plum-200 hover:bg-plum-50">
                {useLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
