import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";
import { EmptyState } from "./layout";
import { Spinner } from "./Spinner";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  empty,
  page,
  pageSize,
  total,
  onPageChange,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  empty: { icon: LucideIcon; title: string; description?: string; action?: ReactNode };
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 font-semibold", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows?.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-plum-50/40">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && !rows?.length && (
        <div className="flex justify-center py-14">
          <Spinner />
        </div>
      )}
      {error && <p className="px-4 py-10 text-center text-sm text-red-600">{error}</p>}
      {!loading && !error && rows?.length === 0 && <EmptyState {...empty} />}

      {total > 0 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-500">
          <span>
            {from}–{to} of {total}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
