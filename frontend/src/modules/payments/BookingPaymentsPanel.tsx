import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type PaymentLinkRow, type PaymentRow } from "@mashkoor/shared";
import { Check, Copy, Link2, Mail, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatDateTime, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, Card } from "@/core/ui/layout";
import { useBookingLinks, useBookingPayments, useCancelPaymentLink, useCreatePaymentLink, useRecordPayment, useRejectPayment, useSendPaymentLink, useVerifyPayment } from "./api";

const statusTone = (s: PaymentRow["status"]) => (s === "VERIFIED" ? "green" : s === "REJECTED" ? "red" : "amber");

/** Money received against one booking: balance due, payment history, and a form to record a new receipt. */
export function BookingPaymentsPanel({ bookingId }: { bookingId: string }) {
  const { data } = useBookingPayments(bookingId);
  const ability = useAbility("admin");
  const [recording, setRecording] = useState(false);
  const [linking, setLinking] = useState(false);
  const verify = useVerifyPayment();
  const reject = useRejectPayment();
  const canVerify = ability.can("manage", "Booking");

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Payments</h2>
        <div className="flex gap-2">
          {ability.can("update", "Booking") && (data?.balanceDue ?? 0) > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setLinking(true)}>
              <Link2 className="h-4 w-4" aria-hidden /> Payment link
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setRecording(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Record payment
          </Button>
        </div>
      </div>

      {data && (
        <dl className="mb-4 grid grid-cols-3 gap-3 rounded-lg bg-surface p-3 text-sm">
          <div>
            <dt className="text-xs text-ink-500">Collected</dt>
            <dd className="font-semibold">{formatINR(data.totalCollected - data.totalRefunded)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Total</dt>
            <dd className="font-semibold">{formatINR(data.totalSell)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Balance due</dt>
            <dd className={cn("font-semibold", data.balanceDue > 0 ? "text-red-600" : "text-emerald-700")}>{formatINR(data.balanceDue)}</dd>
          </div>
        </dl>
      )}

      {data?.payments.length === 0 && <p className="text-sm text-ink-500">No payments recorded yet.</p>}
      <ul className="divide-y divide-line">
        {data?.payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <span>
              <span className="font-semibold">{p.direction === "REFUND" ? "Refund" : PAYMENT_METHOD_LABELS[p.method]}</span>{" "}
              <Badge tone={statusTone(p.status)}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
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
              {canVerify && p.status === "PENDING" && (
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

      <PaymentLinks bookingId={bookingId} />
      <RecordPaymentDialog bookingId={bookingId} open={recording} onClose={() => setRecording(false)} />
      <PaymentLinkDialog bookingId={bookingId} balanceDue={data?.balanceDue ?? 0} open={linking} onClose={() => setLinking(false)} />
    </Card>
  );
}

const linkTone = (s: PaymentLinkRow["status"]) => (s === "PAID" ? "green" : s === "ACTIVE" ? "plum" : s === "CANCELLED" ? "red" : "neutral");

/** Links sent to the customer to pay online. Active ones can be copied, emailed or cancelled. */
function PaymentLinks({ bookingId }: { bookingId: string }) {
  const { data: links } = useBookingLinks(bookingId);
  const cancel = useCancelPaymentLink();
  const send = useSendPaymentLink();
  if (!links?.length) return null;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      window.prompt("Copy this link", url);
    }
  };
  const email = async (id: string) => {
    try {
      const result = await send.mutateAsync(id);
      if (result.sent) toast.success("Link emailed to the customer");
      else toast.error(result.reason ?? "Couldn't send the email");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="mb-2 text-sm font-semibold text-ink-700">Payment links</h3>
      <ul className="divide-y divide-line">
        {links.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              <span className="font-semibold">{formatINR(l.amount)}</span> <Badge tone={linkTone(l.status)}>{l.status.charAt(0) + l.status.slice(1).toLowerCase()}</Badge>
              <span className="block text-xs text-ink-500">
                {l.status === "PAID" ? `Paid ${formatDateTime(l.paidAt)}` : `Expires ${formatDateTime(l.expiresAt)}`}
                {l.note && ` · ${l.note}`}
              </span>
            </span>
            {l.status === "ACTIVE" && (
              <span className="flex gap-1">
                <Button variant="ghost" size="sm" aria-label="Copy link" onClick={() => void copy(l.url)}>
                  <Copy className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Email link to customer" onClick={() => void email(l.id)}>
                  <Mail className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Cancel link" onClick={() => withToast(cancel.mutateAsync(l.id), "Link cancelled")}>
                  <X className="h-4 w-4 text-red-600" aria-hidden />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentLinkDialog({ bookingId, balanceDue, open, onClose }: { bookingId: string; balanceDue: number; open: boolean; onClose: () => void }) {
  const create = useCreatePaymentLink();
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("72");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const submit = async () => {
    setError(null);
    try {
      const link = await create.mutateAsync({ bookingId, amount: amount ? Number(amount) : undefined, expiresInHours: Number(hours) || 72, note: note || null });
      try {
        await navigator.clipboard.writeText(link.url);
        toast.success("Payment link created and copied");
      } catch {
        toast.success("Payment link created");
      }
      setAmount("");
      setNote("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open onClose={onClose} title="Create payment link" description="Send the customer a secure page to pay online. The payment is recorded automatically once it goes through.">
      <div className="space-y-4">
        <FormError message={error} />
        <TextField label="Amount (₹)" type="number" min={1} max={balanceDue} value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Leave empty for the full balance — ${formatINR(balanceDue)}`} />
        <SelectField label="Link valid for" value={hours} onChange={(e) => setHours(e.target.value)}>
          <option value="24">1 day</option>
          <option value="72">3 days</option>
          <option value="168">7 days</option>
          <option value="720">30 days</option>
        </SelectField>
        <TextField label="Note to customer" hint="Optional, e.g. “Advance to hold your seats”" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create link
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RecordPaymentDialog({ bookingId, open, onClose }: { bookingId: string; open: boolean; onClose: () => void }) {
  const record = useRecordPayment();
  const [direction, setDirection] = useState<"COLLECTION" | "REFUND">("COLLECTION");
  const [method, setMethod] = useState<(typeof MANUAL_PAYMENT_METHODS)[number]>("BANK_TRANSFER");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const submit = async () => {
    setError(null);
    try {
      await record.mutateAsync({ bookingId, direction, method, amount: Number(amount), reference: reference || null, notes: notes || null });
      toast.success("Payment recorded — it counts once verified");
      setAmount("");
      setReference("");
      setNotes("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open onClose={onClose} title="Record payment" description="Log money received (or refunded) outside the system. A manager verifies it before it counts.">
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Type" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
            <option value="COLLECTION">Payment received</option>
            <option value="REFUND">Refund paid out</option>
          </SelectField>
          <SelectField label="Method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {MANUAL_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField label="Amount (₹)" type="number" min={1} required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        <TextField label="Reference" hint="UTR, cheque number, receipt book number…" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextareaField label="Notes" hint="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!amount} loading={record.isPending}>
            Record
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
