import { zodResolver } from "@hookform/resolvers/zod";
import {
  enquiryConvertSchema,
  enquiryInputSchema,
  LEAD_PRIORITIES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  TRIP_TYPE_LABELS,
  TRIP_TYPES,
  type EnquiryRow,
} from "@mashkoor/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { useConvertEnquiry, useCreateEnquiry, useEnquiryStatus } from "../api";

type NewIn = z.input<typeof enquiryInputSchema>;
type NewOut = z.output<typeof enquiryInputSchema>;

/** A call or walk-in written down in a few seconds: name, number, what they said. Requirements come later, on the call. */
export function NewEnquiryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="New enquiry" description="Just who they are and how to reach them. The sales rep collects the requirements when they call." size="md">
      <NewEnquiryForm onDone={onClose} />
    </Dialog>
  );
}

function NewEnquiryForm({ onDone }: { onDone: () => void }) {
  const create = useCreateEnquiry();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<NewIn, unknown, NewOut>({ resolver: zodResolver(enquiryInputSchema), defaultValues: { source: "PHONE" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const enquiry = await create.mutateAsync(values);
      toast.success(`Enquiry from ${enquiry.contactName} added`);
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Mobile" type="tel" required autoFocus placeholder="98765 43210" error={formState.errors.phone?.message} {...register("phone")} />
        <TextField label="Name" required error={formState.errors.contactName?.message} {...register("contactName")} />
        <TextField label="Email" type="email" hint="Optional" error={formState.errors.email?.message} {...register("email")} />
        <SelectField label="Source" {...register("source")}>
          {LEAD_SOURCES.filter((s) => s !== "B2C_PORTAL" && s !== "B2B").map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABELS[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextareaField label="What they said" hint="Optional" placeholder="e.g. Asked about Umrah in December, family of 4" {...register("message")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Add enquiry
        </Button>
      </div>
    </form>
  );
}

/** Marks the first call done, with a note of how it went. */
export function ContactedDialog({ enquiry, onClose }: { enquiry: EnquiryRow | null; onClose: () => void }) {
  const status = useEnquiryStatus();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!enquiry) return;
    setError(null);
    try {
      await status.mutateAsync({ id: enquiry.id, status: "CONTACTED", note: note || null });
      toast.success(`${enquiry.contactName} marked as contacted`);
      setNote("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open={Boolean(enquiry)} onClose={onClose} title="Mark as contacted" description={enquiry ? `How did the call with ${enquiry.contactName} go?` : undefined}>
      <div className="space-y-4">
        <FormError message={error} />
        <TextareaField label="Note" hint="Optional — kept with the enquiry" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Will confirm dates tomorrow" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={status.isPending}>
            Mark contacted
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

type ConvertIn = z.input<typeof enquiryConvertSchema>;
type ConvertOut = z.output<typeof enquiryConvertSchema>;

/** The rep has spoken to the customer: capture what they want. This creates the lead and removes the enquiry. */
export function ConvertDialog({ enquiry, onClose }: { enquiry: EnquiryRow | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(enquiry)} onClose={onClose} title="Convert to lead" description="Write down what the customer wants. The enquiry becomes a lead and is removed from this list." size="lg">
      {enquiry && <ConvertForm enquiry={enquiry} onDone={onClose} />}
    </Dialog>
  );
}

function ConvertForm({ enquiry, onDone }: { enquiry: EnquiryRow; onDone: () => void }) {
  const navigate = useNavigate();
  const convert = useConvertEnquiry();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<ConvertIn, unknown, ConvertOut>({
    resolver: zodResolver(enquiryConvertSchema),
    defaultValues: { productType: "HOLIDAY", tripType: "FIT", adults: 2, children: 0, infants: 0, priority: "WARM", requirements: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const lead = await convert.mutateAsync({ id: enquiry.id, ...values });
      toast.success(`Lead ${lead.refNo} created`);
      onDone();
      navigate(`/admin/leads/${lead.id}`);
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  const numberOrNull = (v: string) => (v === "" || v == null ? null : Number(v));

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <p className="rounded-lg bg-surface p-3 text-sm text-ink-700">
        <span className="font-semibold">{enquiry.contactName}</span> · {enquiry.phone}
        {enquiry.message && <span className="mt-1 block text-xs whitespace-pre-line text-ink-500">{enquiry.message}</span>}
      </p>
      <TextareaField label="What the customer wants" required rows={4} placeholder="Hotel preference, flights, visa, special requests…" error={formState.errors.requirements?.message} {...register("requirements")} />
      <div className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-2">
        <SelectField label="Product" {...register("productType")}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Trip type" {...register("tripType")}>
          {TRIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRIP_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <TextField label="Destination" placeholder="e.g. Makkah & Madinah" {...register("destination")} />
        <SelectField label="Priority" {...register("priority")}>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </SelectField>
        <TextField label="Departure" type="date" error={formState.errors.travelFrom?.message} {...register("travelFrom")} />
        <TextField label="Return" type="date" error={formState.errors.travelTo?.message} {...register("travelTo")} />
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <TextField label="Adults" type="number" min={0} {...register("adults")} />
          <TextField label="Children" type="number" min={0} {...register("children")} />
          <TextField label="Infants" type="number" min={0} {...register("infants")} />
        </div>
        <TextField label="Budget from (₹)" hint="Optional" type="number" min={0} {...register("budgetMin", { setValueAs: numberOrNull })} />
        <TextField label="Budget to (₹)" hint="Optional" type="number" min={0} error={formState.errors.budgetMax?.message} {...register("budgetMax", { setValueAs: numberOrNull })} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Create lead
        </Button>
      </div>
    </form>
  );
}
