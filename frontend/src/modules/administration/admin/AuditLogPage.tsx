import type { AuditLogRow } from "@mashkoor/shared";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDateTime } from "@/core/format";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { PageHeader } from "@/core/ui/layout";
import { useAuditEntityTypes, useAuditLog } from "../api";

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function Changes({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  if (row.before == null && row.after == null) return <span className="text-ink-300">—</span>;
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-semibold text-plum-700">
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />} Details
      </button>
      {open && (
        <div className="mt-2 grid max-w-lg gap-2 text-xs">
          {row.before != null && <pre className="overflow-x-auto rounded bg-surface p-2"><strong>Before</strong>{"\n"}{pretty(row.before)}</pre>}
          {row.after != null && <pre className="overflow-x-auto rounded bg-surface p-2"><strong>After</strong>{"\n"}{pretty(row.after)}</pre>}
        </div>
      )}
    </div>
  );
}

/** Who did what, and when. Read-only. */
export function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";
  const entityType = params.get("entityType") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const { data: types = [] } = useAuditEntityTypes();
  const { data, isLoading, error } = useAuditLog({ page, q, entityType: entityType || undefined, from: from || undefined, to: to || undefined });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const columns: Column<AuditLogRow>[] = [
    { key: "when", header: "When", cell: (r) => <span className="whitespace-nowrap text-ink-500">{formatDateTime(r.createdAt)}</span> },
    { key: "actor", header: "Who", cell: (r) => (r.actor ? <span className="font-semibold">{r.actor.name}</span> : <span className="text-ink-500">System</span>) },
    { key: "action", header: "Action", cell: (r) => <code className="rounded bg-surface px-1.5 py-0.5 text-xs">{r.action}</code> },
    {
      key: "entity",
      header: "On",
      cell: (r) => (
        <span className="text-xs text-ink-700">
          {r.entityType}
          {r.entityId && <span className="block max-w-[10rem] truncate text-ink-500" title={r.entityId}>{r.entityId}</span>}
        </span>
      ),
    },
    { key: "portal", header: "Via", cell: (r) => <span className="text-xs text-ink-500">{r.portal ?? "—"}</span> },
    { key: "changes", header: "Changes", cell: (r) => <Changes row={r} /> },
  ];

  return (
    <>
      <PageHeader title="Audit log" description="A record of sensitive actions: approvals, payments, wallet changes, status changes and more." />
      <div className="mb-4 flex flex-wrap gap-3">
        <input type="search" placeholder="Search action or record id…" defaultValue={q} onChange={(e) => set("q", e.target.value)} className={`${inputClass} w-64`} />
        <select aria-label="Record type" value={entityType} onChange={(e) => set("entityType", e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">All record types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input type="date" aria-label="From date" value={from} onChange={(e) => set("from", e.target.value)} className={`${inputClass} w-auto`} />
        <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => set("to", e.target.value)} className={`${inputClass} w-auto`} />
      </div>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: ScrollText, title: "Nothing recorded for these filters" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 30}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
    </>
  );
}
