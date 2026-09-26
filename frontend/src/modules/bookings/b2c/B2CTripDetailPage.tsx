import { BOOKING_DOCUMENT_KIND_LABELS, BOOKING_ITEM_TYPE_LABELS, BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@mashkoor/shared";
import { AlertTriangle, Check, CreditCard, Download, FileText, MessageSquare, Star } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatDateTime, formatINR } from "@/core/format";
import { cn } from "@/core/ui/cn";
import { Button, buttonClass } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { TextareaField } from "@/core/ui/form";
import { Badge, Card, EmptyState } from "@/core/ui/layout";
import { BackLink, DetailList } from "@/core/ui/misc";
import { FullPageSpinner } from "@/core/ui/Spinner";
import {
  downloadMyDocument,
  useMyReview,
  useMyTrip,
  useMyTripDocuments,
  useMyTripPayments,
  useMyTripTimeline,
  usePayMyBalance,
  useRequestCancellation,
  useSubmitReview,
} from "./api";

export function B2CTripDetailPage() {
  const { id = "" } = useParams();
  const { data: trip, isLoading, error } = useMyTrip(id);
  const { data: payments } = useMyTripPayments(id);
  const { data: timeline } = useMyTripTimeline(id);
  const { data: documents } = useMyTripDocuments(id);
  const pay = usePayMyBalance();
  const [cancelling, setCancelling] = useState(false);
  const payNow = async () => {
    try {
      const link = await pay.mutateAsync(id);
      window.location.assign(link.url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (isLoading) return <FullPageSpinner />;
  if (error || !trip)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Trip not available"
        description={errorMessage(error)}
        action={
          <Link to="/b2c/trips" className={buttonClass("secondary")}>
            Back to my trips
          </Link>
        }
      />
    );

  const canCancel = !timeline?.cancelRequestedAt && !["CANCELLED", "COMPLETED", "FAILED"].includes(trip.status);

  return (
    <>
      <BackLink to="/b2c/trips">My trips</BackLink>
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">
                {PRODUCT_TYPE_LABELS[trip.productType]}
                {trip.destination ? ` · ${trip.destination}` : ""}
              </h1>
              <Badge tone={trip.status === "CONFIRMED" || trip.status === "COMPLETED" ? "green" : trip.status === "CANCELLED" ? "red" : "plum"}>{BOOKING_STATUS_LABELS[trip.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-500">{trip.refNo}</p>
          </div>
          {canCancel && (
            <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}>
              Request cancellation
            </Button>
          )}
        </div>
        {timeline?.cancelRequestedAt && trip.status !== "CANCELLED" && <p className="mt-4 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-700">You've asked to cancel this trip. Our team will be in touch shortly.</p>}
        {trip.status === "CANCELLED" && trip.cancelReason && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Cancelled: {trip.cancelReason}</p>}
        <div className="mt-4">
          <DetailList
            items={[
              { label: "Travel dates", value: trip.travelFrom ? `${formatDate(trip.travelFrom)} → ${formatDate(trip.travelTo)}` : "To be confirmed" },
              { label: "Travellers", value: trip.travelers.length ? trip.travelers.map((t) => `${t.firstName} ${t.lastName ?? ""}`.trim()).join(", ") : "—" },
            ]}
          />
        </div>
      </Card>

      {timeline && (
        <Card className="mb-4 p-5">
          <h2 className="mb-4 text-base font-semibold">Trip progress</h2>
          <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {timeline.steps.map((s, i) => (
              <li key={s.key} className="flex flex-col items-center text-center">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold", s.state === "done" ? "bg-emerald-600 text-white" : s.state === "current" ? "bg-plum-600 text-white" : "bg-surface text-ink-500")}>
                  {s.state === "done" ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className="mt-1.5 text-xs font-semibold text-ink-900">{s.label}</span>
                {s.detail && <span className="text-[11px] text-ink-500">{s.detail}</span>}
              </li>
            ))}
          </ol>
          {timeline.updates.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line pt-3 text-sm">
              {timeline.updates.map((u) => (
                <li key={u.id} className="flex gap-2 py-2">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-plum-600" aria-hidden />
                  <span>
                    {u.message}
                    <span className="block text-xs text-ink-500">{u.author} · {formatDateTime(u.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-base font-semibold">What's included</h2>
        <ul className="divide-y divide-line text-sm">
          {trip.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-2">
              <span>
                <Badge tone="plum">{BOOKING_ITEM_TYPE_LABELS[item.type]}</Badge> <span className="ml-1">{item.description}</span>
              </span>
              <span className="font-semibold">{formatINR(item.sellPrice * item.quantity)}</span>
            </li>
          ))}
        </ul>
        {trip.discount > 0 && <p className="mt-2 text-right text-sm text-emerald-700">Discount −{formatINR(trip.discount)}</p>}
        <p className="mt-2 text-right text-base font-semibold">Total {formatINR(trip.totalSell)}</p>
      </Card>

      {documents && documents.length > 0 && (
        <Card className="mb-4 p-5">
          <h2 className="mb-3 text-base font-semibold">Documents</h2>
          <ul className="divide-y divide-line text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-plum-600" aria-hidden />
                  <span>
                    {d.name}
                    <span className="block text-xs text-ink-500">
                      {BOOKING_DOCUMENT_KIND_LABELS[d.kind]} · {formatDate(d.createdAt)}
                    </span>
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Download ${d.name}`}
                  onClick={() =>
                    void downloadMyDocument(id, d.id, d.fileName).catch((e) => toast.error(errorMessage(e)))
                  }
                >
                  <Download className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {payments && (
        <Card className="mb-4 p-5">
          <h2 className="mb-3 text-base font-semibold">Payments</h2>
          <dl className="mb-4 grid grid-cols-3 gap-3 rounded-lg bg-surface p-3 text-sm">
            <div>
              <dt className="text-xs text-ink-500">Paid</dt>
              <dd className="font-semibold">{formatINR(payments.totalCollected - payments.totalRefunded)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Total</dt>
              <dd className="font-semibold">{formatINR(payments.totalSell)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Balance due</dt>
              <dd className={cn("font-semibold", payments.balanceDue > 0 ? "text-red-600" : "text-emerald-700")}>{formatINR(payments.balanceDue)}</dd>
            </div>
          </dl>
          {payments.balanceDue > 0 && trip.status !== "CANCELLED" && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-700">
              <span>Pay your balance securely online, or contact our team for bank transfer or UPI details.</span>
              <Button size="sm" onClick={() => void payNow()} loading={pay.isPending}>
                <CreditCard className="h-4 w-4" aria-hidden /> Pay {formatINR(payments.balanceDue)}
              </Button>
            </div>
          )}
          <ul className="divide-y divide-line text-sm">
            {payments.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span>
                  {p.direction === "REFUND" ? "Refund" : PAYMENT_METHOD_LABELS[p.method]} · {PAYMENT_STATUS_LABELS[p.status]}
                  <span className="block text-xs text-ink-500">
                    {p.receiptNo} · {formatDateTime(p.createdAt)}
                  </span>
                </span>
                <span className="font-semibold">{formatINR(p.amount)}</span>
              </li>
            ))}
            {payments.payments.length === 0 && <li className="py-2 text-ink-500">No payments yet.</li>}
          </ul>
        </Card>
      )}

      {trip.status === "COMPLETED" && <ReviewCard bookingId={id} />}

      <CancelRequestDialog bookingId={id} open={cancelling} onClose={() => setCancelling(false)} />
    </>
  );
}

function CancelRequestDialog({ bookingId, open, onClose }: { bookingId: string; open: boolean; onClose: () => void }) {
  const request = useRequestCancellation(bookingId);
  const [reason, setReason] = useState("");
  if (!open) return null;

  const submit = async () => {
    try {
      await request.mutateAsync(reason);
      toast.success("Cancellation requested — our team will be in touch");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open onClose={onClose} title="Request cancellation" description="Our team will review this and get back to you about any charges before anything is cancelled.">
      <div className="space-y-4">
        <TextareaField label="Why are you cancelling?" required value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep trip
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={request.isPending} disabled={reason.trim().length < 2}>
            Send request
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ReviewCard({ bookingId }: { bookingId: string }) {
  const { data: review, isLoading } = useMyReview(bookingId);
  const submit = useSubmitReview(bookingId);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  if (isLoading) return null;
  if (review) {
    return (
      <Card className="p-5">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
          <Star className="h-4 w-4 text-gold-500" aria-hidden /> Your review
        </h2>
        <p className="text-sm text-ink-700">
          {"★".repeat(review.rating)}
          {"☆".repeat(5 - review.rating)} — {review.comment}
        </p>
        <p className="mt-1 text-xs text-ink-500">{review.published ? "Published on our website" : "Thanks — our team will review it before it goes live"}</p>
      </Card>
    );
  }

  const send = async () => {
    try {
      await submit.mutateAsync({ rating, comment });
      toast.success("Thank you for your review!");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Star className="h-4 w-4 text-gold-500" aria-hidden /> How was your trip?
      </h2>
      <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)} className="p-0.5">
            <Star className={cn("h-6 w-6", n <= rating ? "fill-gold-400 text-gold-400" : "text-ink-300")} aria-hidden />
          </button>
        ))}
      </div>
      <TextareaField label="Tell us about it" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => void send()} loading={submit.isPending} disabled={comment.trim().length < 10}>
          Submit review
        </Button>
      </div>
    </Card>
  );
}
