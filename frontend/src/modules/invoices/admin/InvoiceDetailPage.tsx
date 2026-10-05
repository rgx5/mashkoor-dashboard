import { INVOICE_PAYMENT_STATE_LABELS, lineTotal, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type InvoicePaymentEntry } from "@mashkoor/shared";
import { AlertTriangle, Check, Mail, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatDate, formatDateTime, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button, buttonClass } from "@/core/ui/Button";
import { PdfDownloadMenu } from "@/core/ui/PdfDownloadMenu";
import { cn } from "@/core/ui/cn";
import { Badge, Card, EmptyState } from "@/core/ui/layout";
import { BackLink, DetailList } from "@/core/ui/misc";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { RecordPaymentDialog, useRejectPayment, useVerifyPayment } from "@/modules/payments";
import { downloadInvoice, useCancelInvoice, useInvoice, useSendInvoice } from "../api";
import { invoiceTone } from "./InvoicesPage";

const paymentTone = (s: InvoicePaymentEntry["status"]) => (s === "VERIFIED" ? "green" : s === "REJECTED" ? "red" : "amber");

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const { data: invoice, isLoading, error } = useInvoice(id);
  const ability = useAbility("admin");
  const send = useSendInvoice();
  const cancel = useCancelInvoice();
  const verify = useVerifyPayment();
  const reject = useRejectPayment();
  const [recording, setRecording] = useState(false);

  if (isLoading) return <FullPageSpinner />;
  if (error || !invoice)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Invoice not available"
        description={errorMessage(error, "It may have been removed.")}
        action={
          <Link to="/admin/invoices" className={buttonClass("secondary")}>
            Back to invoices
          </Link>
        }
      />
    );

  const cancelled = invoice.state === "CANCELLED";
  const canCollect = ability.can("collect", "Booking") && !cancelled;
  const canEdit = ability.can("update", "Invoice");

  const sendInvoice = async () => {
    try {
      const result = await send.mutateAsync(invoice.id);
      if (result.sent) toast.success(`Invoice emailed to ${invoice.customerEmail}`);
      else toast.error(result.reason ?? "Could not send the invoice");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <BackLink to="/admin/invoices">Invoices</BackLink>

      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{invoice.refNo}</h1>
              <Badge tone={invoiceTone(invoice.state)}>{INVOICE_PAYMENT_STATE_LABELS[invoice.state]}</Badge>
              {invoice.sentAt && <Badge tone="neutral">Sent {formatDate(invoice.sentAt)}</Badge>}
            </div>
            {invoice.subject && <p className="mt-1 text-sm font-medium text-ink-700">{invoice.subject}</p>}
            <p className="mt-1 text-sm text-ink-500">
              <Link to={`/admin/customers/${invoice.customer.id}`} className="font-medium text-plum-700 hover:underline">
                {invoice.customer.fullName}
              </Link>{" "}
              ·{" "}
              <Link to={`/admin/bookings/${invoice.booking.id}`} className="hover:underline">
                {invoice.booking.refNo}
              </Link>
              {invoice.lead && (
                <>
                  {" "}
                  ·{" "}
                  <Link to={`/admin/leads/${invoice.lead.id}`} className="hover:underline">
                    {invoice.lead.refNo}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PdfDownloadMenu
              withHint="Every item with its own price, discount and tax"
              withoutHint="The items, and one total for all of them"
              onDownload={(breakup) => void withToast(downloadInvoice(invoice.id, `${invoice.refNo}${breakup ? "" : "-total-only"}.pdf`, breakup), "Invoice downloaded")}
            />
            {canEdit && !cancelled && (
              <Link to={`/admin/invoices/${invoice.id}/edit`} className={buttonClass("secondary", "sm")}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </Link>
            )}
            {canEdit && !cancelled && (
              <Button variant="secondary" size="sm" loading={send.isPending} onClick={sendInvoice}>
                <Mail className="h-4 w-4" aria-hidden /> {invoice.sentAt ? "Send again" : "Email to customer"}
              </Button>
            )}
            {canCollect && invoice.balance > 0 && (
              <Button size="sm" onClick={() => setRecording(true)}>
                <Plus className="h-4 w-4" aria-hidden /> Record payment
              </Button>
            )}
            {canEdit && !cancelled && invoice.paid === 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (window.confirm(`Cancel invoice ${invoice.refNo}? You can raise a new one afterwards.`)) void withToast(cancel.mutateAsync(invoice.id), "Invoice cancelled");
                }}
              >
                Cancel invoice
              </Button>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-3 rounded-lg bg-surface p-4 text-sm">
          <div>
            <dt className="text-xs text-ink-500">Total</dt>
            <dd className="text-lg font-semibold">{formatINR(invoice.total)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Paid</dt>
            <dd className="text-lg font-semibold text-emerald-700">{formatINR(invoice.paid)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Balance due</dt>
            <dd className={cn("text-lg font-semibold", invoice.balance > 0 ? "text-red-600" : "text-emerald-700")}>{formatINR(invoice.balance)}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Rate</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoice.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{l.description}</p>
                      {l.detail && <p className="text-xs whitespace-pre-line text-ink-500">{l.detail}</p>}
                      {((l.discount ?? 0) > 0 || (l.taxPercent ?? 0) > 0) && (
                        <p className="text-xs text-ink-500">
                          {(l.discount ?? 0) > 0 && `Less ${formatINR(l.discount ?? 0)}`}
                          {(l.discount ?? 0) > 0 && (l.taxPercent ?? 0) > 0 && " · "}
                          {(l.taxPercent ?? 0) > 0 && `Tax ${l.taxPercent}%`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{l.quantity}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(l.unitPrice)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(lineTotal(l))}</td>
                  </tr>
                ))}
                {invoice.adjustment !== 0 && (
                  <tr className="text-ink-500">
                    <td className="px-4 py-2.5" colSpan={3}>
                      {invoice.adjustment < 0 ? "Discount" : "Adjustment"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(invoice.adjustment)}</td>
                  </tr>
                )}
                <tr className="bg-plum-50/50 font-semibold">
                  <td className="px-4 py-3" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(invoice.total)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Payment entries</h2>
            {invoice.payments.length === 0 && <p className="text-sm text-ink-500">No payments recorded against this invoice yet.</p>}
            <ul className="divide-y divide-line">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <span className="font-semibold">{p.direction === "REFUND" ? "Refund" : PAYMENT_METHOD_LABELS[p.method]}</span> <Badge tone={paymentTone(p.status)}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                    <span className="block text-xs text-ink-500">
                      {p.receiptNo} · {formatDateTime(p.createdAt)}
                      {p.reference && ` · ${p.reference}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("font-semibold", p.direction === "REFUND" && "text-red-600")}>
                      {p.direction === "REFUND" ? "−" : ""}
                      {formatINR(p.amount)}
                    </span>
                    {canCollect && p.status === "PENDING" && (
                      <>
                        <Button variant="ghost" size="sm" aria-label="Verify payment" onClick={() => withToast(verify.mutateAsync(p.id), "Payment verified")}>
                          <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Reject payment"
                          onClick={() => {
                            const reason = window.prompt("Why is this payment being rejected?");
                            if (reason?.trim()) void withToast(reject.mutateAsync({ id: p.id, reason: reason.trim() }), "Payment rejected");
                          }}
                        >
                          <X className="h-4 w-4 text-red-600" aria-hidden />
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-500">A payment counts towards the invoice once it is verified. When the invoice is paid in full, the lead is marked Won.</p>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Details</h2>
            <DetailList
              items={[
                { label: "Issued", value: formatDate(invoice.issueDate) },
                { label: "Due by", value: invoice.dueDate ? formatDate(invoice.dueDate) : "—" },
                { label: "Email", value: invoice.customerEmail ?? "No email on file" },
              ]}
            />
            {invoice.notes && <p className="mt-4 rounded-lg bg-surface p-3 text-sm whitespace-pre-line text-ink-700">{invoice.notes}</p>}
            {invoice.terms && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold text-ink-500">Terms</p>
                <p className="text-xs whitespace-pre-line text-ink-700">{invoice.terms}</p>
              </div>
            )}
          </Card>
        </aside>
      </div>

      <RecordPaymentDialog bookingId={invoice.booking.id} invoiceId={invoice.id} open={recording} onClose={() => setRecording(false)} />
    </>
  );
}
