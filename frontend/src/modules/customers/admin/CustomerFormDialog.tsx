import { zodResolver } from "@hookform/resolvers/zod";
import { CONTACT_CHANNELS, CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES, customerInputSchema, LEAD_SOURCE_LABELS, LEAD_SOURCES, type CustomerDetail, type CustomerInput } from "@mashkoor/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { ApiError } from "@/core/api/client";
import { applyApiErrors } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, Field, FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { StaffSelect } from "@/modules/users";
import { lookupCustomers, useCreateCustomer, useUpdateCustomer, type DuplicateMatch } from "../api";
import { DuplicateNotice } from "../DuplicateNotice";

type FormIn = z.input<typeof customerInputSchema>;
type FormOut = z.output<typeof customerInputSchema>;

export function CustomerFormDialog({ open, onClose, customer }: { open: boolean; onClose: () => void; customer?: CustomerDetail }) {
  return (
    <Dialog open={open} onClose={onClose} title={customer ? "Edit customer" : "New customer"} size="lg">
      <CustomerForm customer={customer} onDone={onClose} />
    </Dialog>
  );
}

function CustomerForm({ customer, onDone }: { customer?: CustomerDetail; onDone: () => void }) {
  const navigate = useNavigate();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  const { register, handleSubmit, setError, getValues, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: customer
      ? {
          type: customer.type,
          fullName: customer.fullName,
          phone: customer.phone,
          altPhone: customer.altPhone,
          email: customer.email,
          whatsappOptIn: customer.whatsappOptIn,
          preferredChannel: customer.preferredChannel,
          city: customer.city,
          state: customer.state,
          source: customer.source,
          ownerId: customer.owner?.id ?? null,
          notes: customer.notes,
          tags: customer.tags,
        }
      : { type: "INDIVIDUAL", source: "PHONE", preferredChannel: "WHATSAPP", whatsappOptIn: true },
  });

  const checkDuplicates = async () => {
    const { phone, email } = getValues();
    if (!phone && !email) return;
    try {
      setDuplicates(await lookupCustomers({ phone: phone || undefined, email: email || undefined, excludeId: customer?.id }));
    } catch {
      /* lookup is best-effort */
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const input: CustomerInput = { ...values, ownerId: values.ownerId || null };
    try {
      if (customer) {
        await update.mutateAsync({ id: customer.id, input });
        toast.success("Customer updated");
        onDone();
      } else {
        const created = await create.mutateAsync({ input, allowDuplicate: confirmedDuplicate });
        toast.success(`${created.fullName} added as ${created.refNo}`);
        onDone();
        navigate(`/admin/customers/${created.id}`);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const details = error.details as { duplicates?: DuplicateMatch[] } | undefined;
        setDuplicates(details?.duplicates ?? []);
        setFormError("This customer may already exist. Open the existing record, or confirm to create a separate customer.");
        return;
      }
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <DuplicateNotice matches={duplicates} onUse={(m) => (onDone(), navigate(`/admin/customers/${m.id}`))} useLabel="Open" />
      {!customer && duplicates.length > 0 && (
        <CheckboxField label="These are different people — create a new customer anyway" checked={confirmedDuplicate} onChange={(e) => setConfirmedDuplicate(e.target.checked)} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" required autoFocus error={formState.errors.fullName?.message} {...register("fullName")} />
        <SelectField label="Type" {...register("type")}>
          {CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {CUSTOMER_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <TextField label="Mobile" type="tel" required placeholder="98765 43210" error={formState.errors.phone?.message} {...register("phone", { onBlur: checkDuplicates })} />
        <TextField label="Alternate mobile" type="tel" hint="Optional" error={formState.errors.altPhone?.message} {...register("altPhone")} />
        <TextField label="Email" type="email" hint="Optional" error={formState.errors.email?.message} {...register("email", { onBlur: checkDuplicates })} />
        <SelectField label="Preferred contact" {...register("preferredChannel")}>
          {CONTACT_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c === "CALL" ? "Phone call" : c === "WHATSAPP" ? "WhatsApp" : "Email"}
            </option>
          ))}
        </SelectField>
        <TextField label="City" {...register("city")} />
        <TextField label="State" {...register("state")} />
        <SelectField label="Source" {...register("source")}>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <Field label="Account owner">
          <StaffSelect {...register("ownerId", { setValueAs: (v) => v || null })} />
        </Field>
      </div>
      <CheckboxField label="Customer agrees to receive WhatsApp messages" {...register("whatsappOptIn")} />
      <TextareaField label="Notes" hint="Optional" {...register("notes")} />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting} disabled={!customer && duplicates.length > 0 && !confirmedDuplicate}>
          {customer ? "Save changes" : "Create customer"}
        </Button>
      </div>
    </form>
  );
}
