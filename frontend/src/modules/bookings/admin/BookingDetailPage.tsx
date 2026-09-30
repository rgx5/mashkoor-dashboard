import {
  BOOKING_ITEM_TYPE_LABELS,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TRANSITIONS,
  PRODUCT_TYPE_LABELS,
  TRIP_TYPE_LABELS,
  type BookingStatus,
} from "@mashkoor/shared";
import { AlertTriangle, Plus, Printer, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { errorMessage, withToast } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button, buttonClass } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { inputClass, TextareaField } from "@/core/ui/form";
import { Badge, Card, EmptyState } from "@/core/ui/layout";
import { BackLink, DetailList } from "@/core/ui/misc";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { BookingPaymentsPanel } from "@/modules/payments";
import { TripExperiencePanel } from "./TripExperiencePanel";
import { useBookingPayments } from "@/modules/payments/api";
import { useAddBookingItem, useBooking, useChangeBookingStatus, useRemoveBookingItem } from "../api";
import { openBookingVoucher } from "../voucher";
import { BookingItemBuilder } from "./BookingItemBuilder";

const statusTone = (status: BookingStatus) =>
  status === "CONFIRMED" || status === "COMPLETED" ? "green" : status === "CANCELLED" || status === "FAILED" ? "red" : status === "INQUIRY" ? "neutral" : "plum";

export function BookingDetailPage() {
  const { id = "" } = useParams();
  const { data: booking, isLoading, error } = useBooking(id);
  const ability = useAbility("admin");
  const [addingItem, setAddingItem] = useState(false);
  const [statusTarget, setStatusTarget] = useState<BookingStatus | null>(null);
  const addItem = useAddBookingItem();
  const removeItem = useRemoveBookingItem();
  const canSeeCost = ability.can("manage", "Booking");
  const { data: paymentSummary } = useBookingPayments(id);

  if (isLoading) return <FullPageSpinner />;
  if (error || !booking)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Booking not available"
        description={errorMessage(error, "It may have been removed.")}
        action={
          <Link to="/admin/bookings" className={buttonClass("secondary")}>
            Back to bookings
          </Link>
        }
      />
    );

  const editable = ["INQUIRY", "QUOTE", "PENDING_PAYMENT"].includes(booking.status);
  const nextStatuses = BOOKING_STATUS_TRANSITIONS[booking.status];

  return (
    <>
      <BackLink to="/admin/bookings">Bookings</BackLink>

      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{booking.refNo}</h1>
              <Badge tone={statusTone(booking.status)}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
              <Badge tone="neutral">{TRIP_TYPE_LABELS[booking.tripType]}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-500">
              <Link to={`/admin/customers/${booking.customer.id}`} className="font-semibold text-plum-700 hover:underline">
                {booking.customer.fullName}
              </Link>{" "}
              · {booking.customer.refNo} · {PRODUCT_TYPE_LABELS[booking.productType]}
              {booking.lead && (
                <>
                  {" "}
                  · from lead{" "}
                  <Link to={`/admin/leads/${booking.lead.id}`} className="font-semibold text-plum-700 hover:underline">
                    {booking.lead.refNo}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => !openBookingVoucher(booking, paymentSummary) && toast.error("Allow pop-ups to print the confirmation")}>
              <Printer className="h-4 w-4" aria-hidden /> Confirmation
            </Button>
            {nextStatuses.map((s) => (
              <Button key={s} variant={s === "CANCELLED" || s === "FAILED" ? "danger" : "primary"} size="sm" onClick={() => setStatusTarget(s)}>
                Move to {BOOKING_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>
        {booking.cancelRequestedAt && booking.status !== "CANCELLED" && (
          <p className="mt-4 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-700">
            <strong>Cancellation requested</strong> — {booking.cancelRequestReason ?? "no reason given"}. Review it, then move the booking to Cancelled (refunds any wallet debit) or leave it as is.
          </p>
        )}
        {booking.status === "CANCELLED" && booking.cancelReason && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Cancelled: {booking.cancelReason} {booking.cancellationFee > 0 && `· Fee ${formatINR(booking.cancellationFee)}`}
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-base font-semibold">Trip details</h2>
            <DetailList
              items={[
                { label: "Destination", value: booking.destination },
                { label: "Travel dates", value: booking.travelFrom ? `${formatDate(booking.travelFrom)} → ${formatDate(booking.travelTo)}` : "—" },
                { label: "Sell price", value: formatINR(booking.totalSell) },
                ...(canSeeCost ? [{ label: "Cost price", value: formatINR(booking.totalCost) }, { label: "Margin", value: booking.totalCost != null ? formatINR(booking.totalSell - booking.totalCost) : "—" }] : []),
                { label: "Discount", value: booking.discount > 0 ? formatINR(booking.discount) : "—" },
              ]}
            />
            {booking.notes && <p className="mt-4 rounded-lg bg-surface p-3 text-sm whitespace-pre-line text-ink-700">{booking.notes}</p>}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Items</h2>
              {editable && (
                <Button size="sm" variant="secondary" onClick={() => setAddingItem(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> Add item
                </Button>
              )}
            </div>
            {booking.items.length === 0 ? (
              <p className="text-sm text-ink-500">No items yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {booking.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      <Badge tone="plum">{BOOKING_ITEM_TYPE_LABELS[item.type]}</Badge> <span className="ml-2 font-medium">{item.description}</span>
                      <span className="ml-2 text-ink-500">
                        × {item.quantity} · {formatINR(item.sellPrice * item.quantity)}
                        {canSeeCost && item.costPrice != null && ` (cost ${formatINR(item.costPrice * item.quantity)})`}
                      </span>
                    </span>
                    {editable && (
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() => window.confirm("Remove this item?") && withToast(removeItem.mutateAsync({ id: booking.id, itemId: item.id }), "Item removed")}
                      >
                        <Trash2 className="h-4 w-4 text-ink-500 hover:text-red-600" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {ability.can("collect", "Booking") && <BookingPaymentsPanel bookingId={booking.id} />}
          <TripExperiencePanel bookingId={booking.id} />
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <UserRound className="h-4 w-4" aria-hidden /> Travellers
            </h2>
            {booking.travelers.length === 0 ? (
              <p className="text-sm text-ink-500">None linked yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {booking.travelers.map((t) => (
                  <li key={t.id}>
                    {t.firstName} {t.lastName}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 text-base font-semibold">Owner</h2>
            <p className="text-sm">{booking.owner?.name ?? "Unassigned"}</p>
          </Card>
        </aside>
      </div>

      <Dialog open={addingItem} onClose={() => setAddingItem(false)} title="Add item">
        <BookingItemBuilder
          onAdd={async (item) => {
            try {
              await addItem.mutateAsync({ id: booking.id, input: item });
              toast.success("Item added");
              setAddingItem(false);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        />
      </Dialog>

      <StatusChangeDialog bookingId={booking.id} target={statusTarget} onClose={() => setStatusTarget(null)} />
    </>
  );
}

function StatusChangeDialog({ bookingId, target, onClose }: { bookingId: string; target: BookingStatus | null; onClose: () => void }) {
  const change = useChangeBookingStatus();
  const [reason, setReason] = useState("");
  const [cancellationFee, setCancellationFee] = useState("0");

  if (!target) return null;
  const needsReason = target === "CANCELLED" || target === "FAILED";

  const submit = async () => {
    try {
      await change.mutateAsync({ id: bookingId, input: { status: target, reason: reason || null, cancellationFee: Number(cancellationFee || 0) } });
      toast.success(`Moved to ${BOOKING_STATUS_LABELS[target]}`);
      setReason("");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Move to ${BOOKING_STATUS_LABELS[target]}`}>
      <div className="space-y-4">
        <TextareaField label={needsReason ? "Why?" : "Note"} required={needsReason} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        {target === "CANCELLED" && (
          <label className="block text-sm font-semibold text-ink-700">
            Cancellation fee (₹)
            <input type="number" min={0} value={cancellationFee} onChange={(e) => setCancellationFee(e.target.value)} className={cn(inputClass, "mt-1.5")} />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={needsReason ? "danger" : "primary"} loading={change.isPending} disabled={needsReason && !reason.trim()} onClick={submit}>
            Confirm
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
