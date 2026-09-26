import { PRODUCT_TYPE_LABELS, PRODUCT_TYPES, type PackageRow } from "@mashkoor/shared";
import { Luggage, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useDeletePackage, usePackages } from "../api";
import { PackageFormDialog } from "./PackageFormDialog";

export function PackagesPage() {
  const [params, setParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const remove = useDeletePackage();
  const page = Number(params.get("page") ?? 1);
  const productType = params.get("productType") ?? "";
  const { data, isLoading, error } = usePackages({ page, pageSize: 25, q: params.get("q") ?? undefined, productType: (productType || undefined) as never });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const columns: Column<PackageRow>[] = [
    {
      key: "title",
      header: "Package",
      cell: (p) => (
        <div>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            {p.featured && <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-label="Featured" />}
            {p.title}
          </span>
          <span className="block text-xs text-ink-500">
            {p.refCode} · {PRODUCT_TYPE_LABELS[p.productType]} {p.destination ? `· ${p.destination.name}` : ""}
          </span>
        </div>
      ),
    },
    { key: "duration", header: "Duration", cell: (p) => (p.nights ? `${p.nights}N / ${p.days}D` : "—") },
    { key: "price", header: "From", cell: (p) => (p.fromPrice ? formatINR(p.fromPrice) : "On request") },
    { key: "status", header: "Status", cell: (p) => <Badge tone={p.published ? "green" : "neutral"}>{p.published ? "Published" : "Draft"}</Badge> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditingId(p.id)} aria-label="Edit">
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => window.confirm(`Delete ${p.title}?`) && withToast(remove.mutateAsync(p.id), "Package deleted")}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Packages"
        description="Hajj, Umrah and holiday packages shown on the website."
        actions={
          <Button onClick={() => setEditingId("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New package
          </Button>
        }
      >
        <input type="search" placeholder="Search packages" defaultValue={params.get("q") ?? ""} onChange={(e) => set("q", e.target.value)} className={`${inputClass} max-w-sm`} />
        <select aria-label="Product" value={productType} onChange={(e) => set("productType", e.target.value)} className={`${inputClass} w-auto`}>
          <option value="">All trip types</option>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </select>
      </PageHeader>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(p) => p.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Luggage, title: "No packages yet" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
      <PackageFormDialog open={editingId !== null} onClose={() => setEditingId(null)} packageId={editingId === "new" ? undefined : (editingId ?? undefined)} />
    </>
  );
}
