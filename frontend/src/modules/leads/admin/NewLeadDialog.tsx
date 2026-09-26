import { zodResolver } from "@hookform/resolvers/zod";
import { LEAD_PRIORITIES, LEAD_SOURCE_LABELS, LEAD_SOURCES, leadInputSchema, PRODUCT_TYPE_LABELS, PRODUCT_TYPES, TRIP_TYPE_LABELS, TRIP_TYPES } from "@mashkoor/shared";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors } from "@/core/api/errors";
import { fromLocalInput } from "@/core/format";
import { useSession } from "@/core/auth/session-store";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { DuplicateNotice, lookupCustomers, type DuplicateMatch } from "@/modules/customers";
import { StaffSelect } from "@/modules/users";
import { useCreateLead } from "../api";

type FormIn = z.input<typeof leadInputSchema>;
type FormOut = z.output<typeof leadInputSchema>;

export interface NewLeadPrefill {
  customerId?: string;
  contactName?: string;
  phone?: string;
  email?: string | null;
}

/** Quick lead capture for calls and walk-ins: phone first, with an instant existing-customer check. */
export function NewLeadDialog({ open, onClose, prefill }: { open: boolean; onClose: () => void; prefill?: NewLeadPrefill }) {
  return (
    <Dialog open={open} onClose={onClose} title="New lead" description="Capture the enquiry now — details can be completed later." size="lg">
      <NewLeadForm onDone={onClose} prefill={prefill} />
    </Dialog>
  );
}

function NewLeadForm({ onDone, prefill }: { onDone: () => void; prefill?: NewLeadPrefill }) {
  const navigate = useNavigate();
  const create = useCreateLead();
  const ability = useAbility("admin");
  const { user } = useSession("admin");
  const [formError, setFormError] = useState<string | null>(null);
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [followUp, setFollowUp] = useState("");

  const { register, handleSubmit, setError, setValue, getValues, watch, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(leadInputSchema),
    defaultValues: {
      source: "PHONE",
      priority: "WARM",
      productType: "HOLIDAY",
      adults: 2,
      children: 0,
      infants: 0,
      ownerId: user?.id ?? null,
      customerId: prefill?.customerId ?? null,
      contactName: prefill?.contactName ?? "",
      phone: prefill?.phone ?? "",
      email: prefill?.email ?? null,
    },
  });
  const linkedCustomerId = watch("customerId");

  useEffect(() => {
    if (prefill?.phone) void checkCustomer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkCustomer() {
    const { phone, email } = getValues();
    if (!phone && !email) return;
    try {
      setMatches(await lookupCustomers({ phone: phone || undefined, email: email || undefined }));
    } catch {
      /* best effort */
    }
  }

  const useCustomer = (m: DuplicateMatch) => {
    setValue("customerId", m.id);
    setValue("contactName", m.fullName);
    setValue("phone", m.phone);
    if (m.email) setValue("email", m.email);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const lead = await create.mutateAsync({ ...values, nextFollowUpAt: fromLocalInput(followUp) });
      toast.success(`Lead ${lead.refNo} created`);
      onDone();
      navigate(`/admin/leads/${lead.id}`);
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Mobile" type="tel" required autoFocus placeholder="98765 43210" error={formState.errors.phone?.message} {...register("phone", { onBlur: checkCustomer })} />
        <TextField label="Contact name" required error={formState.errors.contactName?.message} {...register("contactName")} />
        <TextField label="Email" type="email" hint="Optional" error={formState.errors.email?.message} {...register("email", { onBlur: checkCustomer })} />
        <SelectField label="Source" {...register("source")}>
          {LEAD_SOURCES.filter((s) => s !== "B2C_PORTAL").map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABELS[s]}
            </option>
          ))}
        </SelectField>
      </div>

      {linkedCustomerId ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Linked to existing customer.{" "}
          <button type="button" className="font-semibold underline" onClick={() => setValue("customerId", null)}>
            Unlink
          </button>
        </p>
      ) : (
        <DuplicateNotice matches={matches} onUse={useCustomer} useLabel="Link to this customer" />
      )}

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
        <TextField label="Departure" type="date" error={formState.errors.travelFrom?.message} {...register("travelFrom")} />
        <TextField label="Return" type="date" error={formState.errors.travelTo?.message} {...register("travelTo")} />
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <TextField label="Adults" type="number" min={0} {...register("adults")} />
          <TextField label="Children" type="number" min={0} {...register("children")} />
          <TextField label="Infants" type="number" min={0} {...register("infants")} />
        </div>
        <TextField label="Budget from (₹)" hint="Optional" type="number" min={0} {...register("budgetMin", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
        <TextField label="Budget to (₹)" hint="Optional" type="number" min={0} {...register("budgetMax", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
        <TextField label="Quoted (₹)" hint="What was said verbally, if anything" type="number" min={0} {...register("quotedAmount", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
      </div>

      <TextareaField label="Requirements" placeholder="Hotel preference, special requests…" {...register("requirements")} />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Priority" {...register("priority")}>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </SelectField>
        <TextField label="Next follow-up" type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        <Field label="Owner">
          {ability.can("assign", "Lead") ? (
            <StaffSelect {...register("ownerId", { setValueAs: (v) => v || null })} />
          ) : (
            <select className={inputClass} {...register("ownerId", { setValueAs: (v) => v || null })}>
              <option value={user?.id}>Me</option>
              <option value="">Unassigned</option>
            </select>
          )}
        </Field>
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
