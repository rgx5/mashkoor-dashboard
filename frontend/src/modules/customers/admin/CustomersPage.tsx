import { CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES, formatPhone, LEAD_SOURCE_LABELS, type CustomerRow, type CustomerType } from "@mashkoor/shared";
import { Search, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate } from "@/core/format";
import { Can } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useCustomers } from "../api";
import { CustomerFormDialog } from "./CustomerFormDialog";

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(params.get("new") === "1");
  const filters = { page: Number(params.get("page") ?? 1), q: params.get("q") ?? "", type: (params.get("type") ?? "") as CustomerType | "" };
  const { data, isLoading, error } = useCustomers(filters);

  const setFilter = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (c) => (
        <Link to={`/admin/customers/${c.id}`} className="group block">
          <span className="font-semibold text-ink-900 group-hover:text-plum-700">{c.fullName}</span>
          <span className="block text-xs text-ink-500">
            {c.refNo} · {CUSTOMER_TYPE_LABELS[c.type]}
          </span>
        </Link>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (c) => (
        <div className="text-sm">
          <p>{formatPhone(c.phone)}</p>
          {c.email && <p className="text-xs text-ink-500">{c.email}</p>}
        </div>
      ),
    },
    { key: "city", header: "City", className: "hidden md:table-cell", cell: (c) => c.city ?? "—" },
    { key: "source", header: "Source", className: "hidden lg:table-cell", cell: (c) => <span className="text-ink-500">{LEAD_SOURCE_LABELS[c.source]}</span> },
    { key: "leads", header: "Open leads", className: "hidden sm:table-cell", cell: (c) => (c.openLeads ? <Badge tone="plum">{c.openLeads}</Badge> : <span className="text-ink-300">0</span>) },
    { key: "owner", header: "Owner", className: "hidden lg:table-cell", cell: (c) => c.owner?.name ?? <span className="text-ink-300">—</span> },
    { key: "created", header: "Added", className: "hidden xl:table-cell", cell: (c) => <span className="text-ink-500">{formatDate(c.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Every traveller and family Mashkoor works with."
        actions={
          <Can portal="admin" I="create" a="Customer">
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden /> New customer
            </Button>
          </Can>
        }
      >
        <label className="relative flex-1">
          <span className="sr-only">Search customers</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
          <input type="search" defaultValue={filters.q} placeholder="Search name, mobile, email or MKC number" className={`${inputClass} pl-9`} onChange={(e) => setFilter("q", e.target.value)} />
        </label>
        <select aria-label="Customer type" value={filters.type} onChange={(e) => setFilter("type", e.target.value)} className={`${inputClass} sm:w-44`}>
          <option value="">All types</option>
          {CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {CUSTOMER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </PageHeader>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(c) => c.id}
        loading={isLoading}
        error={error ? errorMessage(error, "Unable to load customers") : null}
        empty={{ icon: Users, title: filters.q ? "No customers match your search" : "No customers yet", description: "Customers are created from leads or added here." }}
        page={filters.page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setFilter("page", String(p))}
      />

      <CustomerFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
