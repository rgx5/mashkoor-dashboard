import { PARTNER_STATUS_LABELS, PARTNER_STATUSES, type PartnerRow, type PartnerStatus } from "@mashkoor/shared";
import { Building } from "lucide-react";
import { useSearchParams, Link } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { formatDate } from "@/core/format";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { usePartners } from "../api";

const statusTone = (s: PartnerStatus) => (s === "APPROVED" ? "green" : s === "PENDING" ? "amber" : "red");

export function PartnersPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const status = (params.get("status") ?? "") as PartnerStatus | "";
  const { data, isLoading, error } = usePartners({ page, pageSize: 25, q: params.get("q") ?? undefined, status: status || undefined });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const columns: Column<PartnerRow>[] = [
    {
      key: "company",
      header: "Agency",
      cell: (p) => (
        <Link to={`/admin/partners/${p.id}`} className="group block">
          <span className="font-semibold group-hover:text-plum-700">{p.companyName}</span>
          <span className="block text-xs text-ink-500">
            {p.refNo} · {p.contactName}
          </span>
        </Link>
      ),
    },
    { key: "contact", header: "Contact", cell: (p) => <span className="text-sm">{p.phone}<br /><span className="text-ink-500">{p.email}</span></span> },
    { key: "city", header: "City", className: "hidden md:table-cell", cell: (p) => p.city ?? "—" },
    { key: "status", header: "Status", cell: (p) => <Badge tone={statusTone(p.status)}>{PARTNER_STATUS_LABELS[p.status]}</Badge> },
    { key: "users", header: "Users", className: "hidden lg:table-cell", cell: (p) => p.userCount },
    { key: "created", header: "Applied", className: "hidden xl:table-cell", cell: (p) => formatDate(p.createdAt) },
  ];

  return (
    <>
      <PageHeader title="Partners" description="B2B agency applications, approvals and accounts." />
      <div className="mb-4 flex gap-3">
        <input type="search" placeholder="Search agencies" defaultValue={params.get("q") ?? ""} onChange={(e) => set("q", e.target.value)} className={`${inputClass} max-w-sm`} />
        <select aria-label="Status" value={status} onChange={(e) => set("status", e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">All statuses</option>
          {PARTNER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PARTNER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(p) => p.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Building, title: "No partner applications yet", description: "Applications from the website's agent form land here." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
    </>
  );
}
