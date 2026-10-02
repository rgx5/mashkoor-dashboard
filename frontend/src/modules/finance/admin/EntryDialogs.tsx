import { zodResolver } from "@hookform/resolvers/zod";
import {
  FINANCE_BOOKING_CATEGORIES,
  FINANCE_CATEGORIES,
  FINANCE_CATEGORY_DIRECTION,
  FINANCE_CATEGORY_LABELS,
  FINANCE_METHODS,
  financeEntryInputSchema,
  PAYMENT_METHOD_LABELS,
  type FinanceCategory,
  type FinanceDirection,
  type LedgerRow,
} from "@mashkoor/shared";
import { Paperclip, Search, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { useBookings } from "@/modules/bookings";
import { useCreateFinanceEntry, useFinanceParties, useReverseFinanceEntry, uploadReceipt } from "../api";

type FormIn = z.input<typeof financeEntryInputSchema>;
type FormOut = z.output<typeof financeEntryInputSchema>;

export interface EntryPreset {
  direction?: FinanceDirection;
  category?: FinanceCategory;
  booking?: { id: string; refNo: string };
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records money that moved outside the booking flow: a supplier payment, an office expense, or the odd extra income. The
 * category decides whether it is money in or out, so the form never asks. A receipt (photo or PDF) can go with it.
 */
export function RecordEntryDialog({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: EntryPreset }) {
  const out = preset?.direction !== "IN";
  return (
    <Dialog open={open} onClose={onClose} title={preset?.direction === "IN" ? "Record money in" : "Record money out"} description={out ? "A supplier payment or an office expense. Entries can't be edited later, only cancelled." : "Income that didn't come through a booking."}>
      <EntryForm preset={preset} onDone={onClose} />
    </Dialog>
  );
}

function EntryForm({ preset, onDone }: { preset?: EntryPreset; onDone: () => void }) {
  const create = useCreateFinanceEntry();
  const { data: parties = [] } = useFinanceParties();
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [booking, setBooking] = useState<{ id: string; refNo: string } | null>(preset?.booking ?? null);

  const categories = FINANCE_CATEGORIES.filter((c) => !preset?.direction || FINANCE_CATEGORY_DIRECTION[c] === preset.direction);
  const { register, handleSubmit, setError, watch, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(financeEntryInputSchema),
    defaultValues: { category: preset?.category ?? categories[0], entryDate: today(), method: "BANK_TRANSFER", bookingId: preset?.booking?.id ?? null },
  });
  const category = watch("category") as FinanceCategory;
  const direction = FINANCE_CATEGORY_DIRECTION[category] ?? "OUT";
  const aboutBooking = FINANCE_BOOKING_CATEGORIES.includes(category);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    let entry: LedgerRow;
    try {
      entry = await create.mutateAsync({ ...values, bookingId: aboutBooking ? (booking?.id ?? null) : null });
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
      return;
    }
    if (receipt) {
      try {
        await uploadReceipt(entry.sourceId, receipt);
      } catch (error) {
        // The money is recorded either way; only the attachment is missing.
        toast.warning(`${entry.entryNo} was recorded, but the receipt didn't upload: ${errorMessage(error)}`);
        onDone();
        return;
      }
    }
    toast.success(`${entry.entryNo} recorded — ${formatINR(entry.amount)} ${direction === "OUT" ? "paid out" : "received"}`);
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="What was it for?" required error={formState.errors.category?.message} {...register("category")}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {FINANCE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <TextField label="Amount (₹)" type="number" min={1} required autoFocus error={formState.errors.amount?.message} {...register("amount")} />
        <TextField label="Date" type="date" required max={today()} hint="The day the money moved" error={formState.errors.entryDate?.message} {...register("entryDate")} />
        <SelectField label={direction === "OUT" ? "Paid by" : "Received by"} {...register("method")}>
          {FINANCE_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </SelectField>
        <TextField
          label={category === "SUPPLIER_PAYMENT" ? "Supplier" : direction === "OUT" ? "Paid to" : "Received from"}
          required={category === "SUPPLIER_PAYMENT"}
          list="finance-parties"
          placeholder={category === "SUPPLIER_PAYMENT" ? "e.g. Al Haram Hotels" : "Optional"}
          error={formState.errors.party?.message}
          {...register("party")}
        />
        <datalist id="finance-parties">
          {parties.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <TextField label="Reference" hint="UTR, cheque or invoice number" error={formState.errors.reference?.message} {...register("reference")} />
      </div>

      {aboutBooking && <BookingPick value={booking} onChange={setBooking} />}

      <TextareaField label="Notes" hint="Optional" rows={2} error={formState.errors.notes?.message} {...register("notes")} />

      <Field label="Receipt" hint="Optional — a photo or PDF of the bill or transfer slip, up to 5 MB">
        {receipt ? (
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />
              <span className="truncate">{receipt.name}</span>
            </span>
            <button type="button" aria-label="Remove receipt" className="text-ink-500 hover:text-red-600" onClick={() => setReceipt(null)}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-plum-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-plum-700`} onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
        )}
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          {direction === "OUT" ? "Record payment" : "Record income"}
        </Button>
      </div>
    </form>
  );
}

/** Which booking a supplier payment was for. Optional — a payment for several bookings can be left unlinked. */
function BookingPick({ value, onChange }: { value: { id: string; refNo: string } | null; onChange: (b: { id: string; refNo: string } | null) => void }) {
  const [query, setQuery] = useState("");
  const { data } = useBookings({ page: 1, q: query || undefined });
  return (
    <Field label="Booking" hint="Optional — links this payment to the booking so its profit and what's still owed are worked out">
      {value ? (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <strong>{value.refNo}</strong>
          <button type="button" className="text-xs font-semibold underline" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
          <input className={`${inputClass} pl-9`} placeholder="Search by booking number or customer" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query.length >= 2 && data && data.data.length > 0 && (
            <div className="mt-1 max-h-44 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white shadow-md">
              {data.data.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-plum-50"
                  onClick={() => {
                    onChange({ id: b.id, refNo: b.refNo });
                    setQuery("");
                  }}
                >
                  <strong>{b.refNo}</strong> <span className="text-ink-500">· {b.customer.fullName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}

/** Cancels an entry. Nothing is deleted: a second entry in the opposite direction is added and both stay on the ledger. */
export function ReverseDialog({ row, onClose }: { row: LedgerRow | null; onClose: () => void }) {
  const reverse = useReverseFinanceEntry();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!row) return;
    setError(null);
    try {
      const entry = await reverse.mutateAsync({ id: row.sourceId, reason });
      toast.success(`${row.entryNo} cancelled — see ${entry.entryNo}`);
      setReason("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open={Boolean(row)} onClose={onClose} title="Cancel this entry" description={row ? `${row.entryNo} · ${formatINR(row.amount)} ${row.direction === "OUT" ? "paid out" : "received"}` : undefined}>
      <div className="space-y-4">
        <FormError message={error} />
        <p className="rounded-lg bg-surface p-3 text-sm text-ink-700">The entry stays on the ledger, marked cancelled, and a matching entry in the opposite direction is added today. Nothing is deleted.</p>
        <TextareaField label="Why is it being cancelled?" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" onClick={submit} loading={reverse.isPending} disabled={reason.trim().length < 3}>
            Cancel entry
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
