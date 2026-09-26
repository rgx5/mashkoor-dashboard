import { PRODUCT_TYPE_LABELS, PRODUCT_TYPES, type BookingItemData, type ProductType } from "@mashkoor/shared";
import { Search, Trash2, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge } from "@/core/ui/layout";
import { useCustomer, useCustomers } from "@/modules/customers";
import { useCreateBooking } from "../api";
import { BookingItemBuilder } from "./BookingItemBuilder";

/** The booking wizard: pick a customer, describe the trip, add priced items, then save. */
export function NewBookingDialog({ open, onClose, customerId: initialCustomerId }: { open: boolean; onClose: () => void; customerId?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title="New booking" size="lg">
      {open && <NewBookingForm initialCustomerId={initialCustomerId} onDone={onClose} />}
    </Dialog>
  );
}

function NewBookingForm({ initialCustomerId, onDone }: { initialCustomerId?: string; onDone: () => void }) {
  const navigate = useNavigate();
  const create = useCreateBooking();
  const [formError, setFormError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [customerQuery, setCustomerQuery] = useState("");
  const { data: customerResults } = useCustomers({ page: 1, q: customerQuery }, customerQuery.length >= 2);
  const { data: customer } = useCustomer(customerId);

  const [productType, setProductType] = useState<ProductType>("HOLIDAY");
  const [destination, setDestination] = useState("");
  const [travelFrom, setTravelFrom] = useState("");
  const [travelTo, setTravelTo] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [travelerIds, setTravelerIds] = useState<string[]>([]);
  const [items, setItems] = useState<(BookingItemData & { label: string })[]>([]);

  const totalSell = items.reduce((sum, i) => sum + i.sellPrice * (i.quantity ?? 1), 0) - Number(discount || 0);

  const submit = async () => {
    setFormError(null);
    if (!customerId) {
      setFormError("Choose a customer first");
      return;
    }
    if (items.length === 0) {
      setFormError('Add at least one item first — search for a room or flight below, or use "Package"/"Other" to add a line by hand, then click Add.');
      return;
    }
    try {
      const booking = await create.mutateAsync({
        customerId,
        productType,
        destination: destination || null,
        travelFrom: travelFrom || null,
        travelTo: travelTo || null,
        notes: notes || null,
        discount: Number(discount || 0),
        travelerIds,
        items: items.map(({ label: _label, ...item }) => item),
      });
      toast.success(`Booking ${booking.refNo} created`);
      onDone();
      navigate(`/admin/bookings/${booking.id}`);
    } catch (error) {
      setFormError(errorMessage(error, "Couldn't create the booking"));
    }
  };

  return (
    <div className="space-y-5">
      <FormError message={formError} />

      {/* Customer */}
      <Field label="Customer" required>
        {customer ? (
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
            <span className="flex items-center gap-2 text-sm text-emerald-800">
              <UserRoundCheck className="h-4 w-4" aria-hidden />
              <strong>{customer.fullName}</strong> · {customer.refNo}
            </span>
            <button type="button" className="text-xs font-semibold text-emerald-700 underline" onClick={() => setCustomerId("")}>
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Search customer by name, mobile or MKC number"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
            />
            {customerResults && customerResults.data.length > 0 && (
              <div className="mt-1 max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white shadow-md">
                {customerResults.data.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-plum-50"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerQuery("");
                    }}
                  >
                    <strong>{c.fullName}</strong> <span className="text-ink-500">· {c.refNo} · {c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Field>

      {/* Trip info */}
      <div className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-2">
        <SelectField label="Product" value={productType} onChange={(e) => setProductType(e.target.value as ProductType)}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField label="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
        <TextField label="Travel from" type="date" value={travelFrom} onChange={(e) => setTravelFrom(e.target.value)} />
        <TextField label="Travel to" type="date" value={travelTo} onChange={(e) => setTravelTo(e.target.value)} />
      </div>

      {/* Travellers */}
      {customer && (
        <Field label="Travellers on this booking">
          {customer.travelers.length === 0 ? (
            <p className="text-sm text-ink-500">This customer has no travellers yet — add them from Customer 360 first, or leave this booking without named travellers.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {customer.travelers.map((t) => (
                <label key={t.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-plum-500 has-checked:bg-plum-50">
                  <input
                    type="checkbox"
                    className="accent-plum-600"
                    checked={travelerIds.includes(t.id)}
                    onChange={(e) => setTravelerIds((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id)))}
                  />
                  {t.firstName} {t.lastName}
                </label>
              ))}
            </div>
          )}
        </Field>
      )}

      {/* Items */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink-700">Add items</h3>
        <BookingItemBuilder onAdd={(item) => setItems((list) => [...list, item])} />
      </div>

      {items.length > 0 && (
        <div className="rounded-xl border border-line">
          <ul className="divide-y divide-line">
            {items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  <Badge tone="plum">{item.type}</Badge> <span className="ml-2">{item.label}</span>{" "}
                  <span className="text-ink-500">
                    × {item.quantity} · {formatINR(item.sellPrice * (item.quantity ?? 1))}
                  </span>
                </span>
                <button type="button" onClick={() => setItems((list) => list.filter((_, idx) => idx !== i))} aria-label="Remove item">
                  <Trash2 className="h-4 w-4 text-ink-500 hover:text-red-600" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line p-3 text-sm">
            <label className="flex items-center gap-2">
              Discount (₹)
              <input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${inputClass} w-28 py-1.5`} />
            </label>
            <span className="font-semibold">
              Total: <span className="text-base">{formatINR(totalSell)}</span>
            </span>
          </div>
        </div>
      )}

      <TextareaField label="Notes" hint="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <p className="text-xs text-ink-500">This booking is assigned to you. Reassign it from the booking page once it's created.</p>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} loading={create.isPending}>
          Create booking
        </Button>
      </div>
    </div>
  );
}
