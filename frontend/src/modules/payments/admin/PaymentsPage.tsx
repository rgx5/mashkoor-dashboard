import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUSES, type PaymentRow, type PaymentStatus } from "@mashkoor/shared";
import { Check, CreditCard, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatDateTime, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { usePayments, useRejectPayment, useVerifyPayment } from "../api";

const tone = (s: PaymentStatus) => (s === "VERIFIED" ? "green" : s === "REJECTED" ? "red" : "amber");

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const ability = useAbility("admin");
  const verify = useVerifyPayment();
  const reject = useRejectPayment();
  const page = Number(params.get("page") ?? 1);
  const status = (params.get("status") ?? "") as PaymentStatus | "";
  const { data, isLoading, error } = usePayments({ page, pageSize: 25, status: status || undefined });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const columns: Column<PaymentRow>[] = [
    {
      key: "receipt",
      header: "Receipt",
      cell: (p) => (
        <div>
          <span className="font-semibold">{p.receiptNo}</span>
          <span className="block text-xs text-ink-500">{formatDateTime(p.createdAt)}</span>
        </div>
      ),
    },
    {
      key: "booking",
      header: "Booking",
      cell: (p) =>
        p.booking ? (
          <Link to={`/admin/bookings/${p.booking.id}`} className="font-semibold text-plum-700 hover:underline">
            {p.booking.refNo}
            <span className="block text-xs font-normal text-ink-500">{p.booking.customer.fullName}</span>
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "method", header: "Method", cell: (p) => `${p.direction === "REFUND" ? "Refund · " : ""}${PAYMENT_METHOD_LABELS[p.method]}` },
    { key: "amount", header: "Amount", cell: (p) => <span className={p.direction === "REFUND" ? "font-semibold text-red-600" : "font-semibold"}>{formatINR(p.amount)}</span> },
    { key: "status", header: "Status", cell: (p) => <Badge tone={tone(p.status)}>{PAYMENT_STATUS_LABELS[p.status]}</Badge> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (p) =>
        ability.can("manage", "Booking") && p.status === "PENDING" ? (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" aria-label="Verify" onClick={() => withToast(verify.mutateAsync(p.id), "Payment verified")}>
              <Check className="h-4 w-4 text-emerald-600" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reject"
              onClick={() => {
                const reason = window.prompt("Why is this payment being rejected?");
                if (reason?.trim()) void withToast(reject.mutateAsync({ id: p.id, reason: reason.trim() }), "Payment rejected");
              }}
            >
              <X className="h-4 w-4 text-red-600" aria-hidden />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Payments" description="Money received against bookings. Record payments from the booking page." />
      <select aria-label="Status" value={status} onChange={(e) => set("status", e.target.value)} className={`${inputClass} mb-4 w-auto`}>
        <option value="">All statuses</option>
        {PAYMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {PAYMENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(p) => p.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: CreditCard, title: "No payments recorded yet" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => set("page", String(p))}
      />
    </>
  );
}
