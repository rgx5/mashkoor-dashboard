import { zodResolver } from "@hookform/resolvers/zod";
import { BOOKING_ITEM_TYPE_LABELS, BOOKING_STATUS_LABELS, bookingInputSchema, PRODUCT_TYPE_LABELS, PRODUCT_TYPES, type BookingRow, type BookingStatus } from "@mashkoor/shared";
import { Luggage, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useMyCustomers } from "@/modules/customers/b2b/api";
import { B2BItemBuilder } from "./B2BItemBuilder";
import { useCreateMyBooking, useMyBookings } from "./api";

type FormIn = z.input<typeof bookingInputSchema>;
type FormOut = z.output<typeof bookingInputSchema>;

const statusTone = (s: BookingStatus) => (s === "CONFIRMED" || s === "COMPLETED" ? "green" : s === "CANCELLED" || s === "FAILED" ? "red" : "plum");

export function B2BBookingsPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const page = Number(params.get("page") ?? 1);
  const { data, isLoading, error } = useMyBookings({ page });

  const columns: Column<BookingRow>[] = [
    {
      key: "ref",
      header: "Booking",
      cell: (b) => (
        <div>
          <Link to={`/b2b/bookings/${b.id}`} className="font-semibold text-plum-700 hover:underline">
            {b.refNo}
          </Link>
          <span className="block text-xs text-ink-500">
            {b.customer.fullName} · {PRODUCT_TYPE_LABELS[b.productType]}
          </span>
        </div>
      ),
    },
    { key: "dates", header: "Travel dates", cell: (b) => (b.travelFrom ? `${formatDate(b.travelFrom)} → ${formatDate(b.travelTo)}` : "—") },
    {
      key: "status",
      header: "Status",
      cell: (b) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone={statusTone(b.status)}>{BOOKING_STATUS_LABELS[b.status]}</Badge>
          {b.cancelRequestedAt && b.status !== "CANCELLED" && <Badge tone="amber">Cancel requested</Badge>}
        </span>
      ),
    },
    { key: "price", header: "Price", cell: (b) => formatINR(b.totalSell) },
  ];

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Submit a booking for Mashkoor's team to confirm."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New booking
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(b) => b.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Luggage, title: "No bookings yet" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(p) }))}
      />
      <Dialog open={creating} onClose={() => setCreating(false)} title="New booking" size="lg">
        <NewBookingForm onDone={() => setCreating(false)} />
      </Dialog>
    </>
  );
}

function NewBookingForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const create = useCreateMyBooking();
  const { data: customers } = useMyCustomers({ page: 1 });
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, setError, control, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(bookingInputSchema),
    defaultValues: { productType: "HOLIDAY", discount: 0, travelerIds: [], items: [] },
  });
  const items = useFieldArray({ control, name: "items" });
  const productType = useWatch({ control, name: "productType" }) ?? "HOLIDAY";

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const booking = await create.mutateAsync(values);
      toast.success(`Booking ${booking.refNo} submitted for approval`);
      onDone();
      navigate(`/b2b/bookings`);
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Customer" required error={formState.errors.customerId?.message} {...register("customerId")}>
          <option value="">Choose a customer…</option>
          {customers?.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </SelectField>
        <SelectField label="Product" {...register("productType")}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField label="Destination" {...register("destination")} />
        <TextField label="Travel from" type="date" {...register("travelFrom")} />
        <TextField label="Travel to" type="date" {...register("travelTo")} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink-700">Items</h3>
        <B2BItemBuilder productType={productType} onAdd={(item) => items.append(item)} />
        {formState.errors.items?.message && <p className="mt-2 text-sm text-red-600">{formState.errors.items.message}</p>}
        {items.fields.length > 0 && (
          <div className="mt-3 space-y-2">
            {items.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[7rem_1fr_4rem_6rem_auto] items-center gap-2">
                <Badge tone="plum">{BOOKING_ITEM_TYPE_LABELS[f.type]}</Badge>
                <input placeholder="Description" className={inputClass} aria-label="Description" {...register(`items.${i}.description`)} />
                <input type="number" min={1} placeholder="Qty" className={inputClass} aria-label="Quantity" {...register(`items.${i}.quantity`)} />
                <input type="number" min={0} placeholder="Price ₹" className={inputClass} aria-label="Price" {...register(`items.${i}.sellPrice`)} />
                <Button type="button" variant="ghost" size="sm" onClick={() => items.remove(i)} aria-label="Remove item">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-500">Prices are what Mashkoor will charge your wallet once confirmed — check with your rate sheet before submitting.</p>
      </div>

      <TextareaField label="Notes" hint="Optional" {...register("notes")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Submit booking
        </Button>
      </div>
    </form>
  );
}
