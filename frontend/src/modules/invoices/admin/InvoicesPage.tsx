import { INVOICE_PAYMENT_STATE_LABELS, INVOICE_PAYMENT_STATES, type InvoiceRow } from "@mashkoor/shared";
import { Plus, ReceiptText } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { useAbility } from "@/core/rbac/ability";
import { buttonClass } from "@/core/ui/Button";
import { formatDate, formatINR } from "@/core/format";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useInvoices } from "../api";

export const invoiceTone = (state: InvoiceRow["state"]) => (state === "PAID" ? "green" : state === "CANCELLED" ? "red" : state === "PARTIAL" ? "amber" : "plum");

export function InvoicesPage() {
  const ability = useAbility("admin");
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";
  const state = (params.get("state") ?? "") as InvoiceRow["state"] | "";
  const { data, isLoading, error } = useInvoices({ page, q: q || undefined, state: state || undefined });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoice",
      header: "Invoice",
      cell: (i) => (
        <Link to={`/admin/invoices/${i.id}`} className="font-semibold text-plum-700 hover:underline">
          {i.refNo}
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (i) => (
        <div>
          <span className="font-medium">{i.customer.fullName}</span>
          <span className="block text-xs text-ink-500">{i.booking.refNo}</span>
        </div>
      ),
    },
    { key: "issued", header: "Issued", className: "hidden md:table-cell", cell: (i) => formatDate(i.issueDate) },
    { key: "due", header: "Due by", className: "hidden md:table-cell", cell: (i) => (i.dueDate ? formatDate(i.dueDate) : "—") },
    { key: "total", header: "Total", className: "text-right", cell: (i) => formatINR(i.total) },
    { key: "paid", header: "Paid", className: "hidden text-right sm:table-cell", cell: (i) => formatINR(i.paid) },
    { key: "balance", header: "Balance", className: "text-right", cell: (i) => <span className={i.balance > 0 ? "font-semibold text-red-600" : ""}>{formatINR(i.balance)}</span> },
    { key: "state", header: "Status", cell: (i) => <Badge tone={invoiceTone(i.state)}>{INVOICE_PAYMENT_STATE_LABELS[i.state]}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Write an invoice from scratch or from a quotation, and record each payment against it."
        actions={
          ability.can("create", "Invoice") && (
            <Link to="/admin/invoices/new" className={buttonClass("primary")}>
              <Plus className="h-4 w-4" aria-hidden /> New invoice
            </Link>
          )
        }
      >
        <input type="search" defaultValue={q} onChange={(e) => set("q", e.target.value)} placeholder="Invoice, customer or booking" className={inputClass} />
        <select aria-label="Status" value={state} onChange={(e) => set("state", e.target.value)} className={inputClass}>
          <option value="">All statuses</option>
          {INVOICE_PAYMENT_STATES.map((s) => (
            <option key={s} value={s}>
              {INVOICE_PAYMENT_STATE_LABELS[s]}
            </option>
          ))}
        </select>
      </PageHeader>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(i) => i.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: ReceiptText, title: "No invoices yet", description: "Click New invoice, or open a quotation or a lead that is with accounts and create one from there." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(p) }))}
      />
    </>
  );
}
