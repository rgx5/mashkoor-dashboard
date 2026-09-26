import { BOOKING_ITEM_TYPE_LABELS, BOOKING_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@mashkoor/shared";
import { AlertTriangle, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Button, buttonClass } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { TextareaField } from "@/core/ui/form";
import { Badge, Card, EmptyState } from "@/core/ui/layout";
import { BackLink, DetailList } from "@/core/ui/misc";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { openBookingVoucher } from "../voucher";
import { useCancelMyBooking, useMyBooking } from "./api";

/** One agency booking: what was booked, where it stands, and a way to ask for (or make) a cancellation. */
export function B2BBookingDetailPage() {
  const { id = "" } = useParams();
  const { data: booking, isLoading, error } = useMyBooking(id);
  const cancel = useCancelMyBooking();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  if (isLoading) return <FullPageSpinner />;
  if (error || !booking)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Booking not available"
        description={errorMessage(error)}
        action={
          <Link to="/b2b/bookings" className={buttonClass("secondary")}>
            Back to bookings
          </Link>
        }
      />
    );

  const closed = booking.status === "CANCELLED" || booking.status === "COMPLETED" || booking.status === "FAILED";
  const requested = Boolean(booking.cancelRequestedAt);
  const direct = ["INQUIRY", "QUOTE", "PENDING_PAYMENT", "PENDING_APPROVAL"].includes(booking.status);

  const submit = async () => {
    try {
      const result = await cancel.mutateAsync({ id, reason });
      toast.success(result.status === "CANCELLED" ? "Booking cancelled" : "Cancellation requested — our team will review it");
      setCancelling(false);
      setReason("");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <BackLink to="/b2b/bookings">Bookings</BackLink>
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{booking.refNo}</h1>
              <Badge tone={booking.status === "CONFIRMED" || booking.status === "COMPLETED" ? "green" : booking.status === "CANCELLED" ? "red" : "plum"}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-500">
              {booking.customer.fullName} · {PRODUCT_TYPE_LABELS[booking.productType]}
              {booking.destination ? ` · ${booking.destination}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS" || booking.status === "COMPLETED" ? (
              <Button variant="secondary" size="sm" onClick={() => !openBookingVoucher(booking) && toast.error("Allow pop-ups to print the confirmation")}>
                <Printer className="h-4 w-4" aria-hidden /> Confirmation
              </Button>
            ) : null}
            {!closed && !requested && (
              <Button variant="danger" size="sm" onClick={() => setCancelling(true)}>
                {direct ? "Cancel booking" : "Request cancellation"}
              </Button>
            )}
          </div>
        </div>
        {requested && !closed && <p className="mt-4 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-700">Cancellation requested. Our team will review it and confirm any charges.</p>}
        {booking.status === "CANCELLED" && booking.cancelReason && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Cancelled: {booking.cancelReason}</p>}
        <div className="mt-4">
          <DetailList
            items={[
              { label: "Travel dates", value: booking.travelFrom ? `${formatDate(booking.travelFrom)} → ${formatDate(booking.travelTo)}` : "—" },
              { label: "Travellers", value: booking.travelers.length ? booking.travelers.map((t) => `${t.firstName} ${t.lastName ?? ""}`.trim()).join(", ") : "—" },
              { label: "Total", value: formatINR(booking.totalSell) },
            ]}
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">Items</h2>
        <ul className="divide-y divide-line text-sm">
          {booking.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-2">
              <span>
                <Badge tone="plum">{BOOKING_ITEM_TYPE_LABELS[item.type]}</Badge> <span className="ml-1">{item.description}</span>
                {item.quantity > 1 && <span className="text-ink-500"> × {item.quantity}</span>}
              </span>
              <span className="font-semibold">{formatINR(item.sellPrice * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-right text-base font-semibold">Total {formatINR(booking.totalSell)}</p>
        <p className="mt-1 text-right text-xs text-ink-500">The total is debited from your wallet when our team confirms the booking.</p>
      </Card>

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={direct ? "Cancel this booking?" : "Request cancellation"}
        description={direct ? "Nothing has been charged yet, so it will be cancelled straight away." : "This booking is already in progress, so our team will review the request and confirm any charges."}
      >
        <div className="space-y-4">
          <TextareaField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelling(false)}>
              Keep booking
            </Button>
            <Button variant="danger" onClick={() => void submit()} loading={cancel.isPending} disabled={reason.trim().length < 2}>
              {direct ? "Cancel booking" : "Send request"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
