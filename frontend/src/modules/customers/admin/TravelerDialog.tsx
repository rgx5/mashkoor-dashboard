import { zodResolver } from "@hookform/resolvers/zod";
import { GENDERS, TRAVELER_RELATION_LABELS, TRAVELER_RELATIONS, travelerInputSchema, type Traveler } from "@mashkoor/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { useSaveTraveler } from "../api";

type FormIn = z.input<typeof travelerInputSchema>;
type FormOut = z.output<typeof travelerInputSchema>;

export function TravelerDialog({ open, onClose, customerId, traveler }: { open: boolean; onClose: () => void; customerId: string; traveler?: Traveler }) {
  return (
    <Dialog open={open} onClose={onClose} title={traveler ? "Edit traveller" : "Add traveller"} description="Details as they appear on the passport." size="lg">
      <TravelerForm customerId={customerId} traveler={traveler} onDone={onClose} />
    </Dialog>
  );
}

function TravelerForm({ customerId, traveler, onDone }: { customerId: string; traveler?: Traveler; onDone: () => void }) {
  const save = useSaveTraveler();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(travelerInputSchema),
    defaultValues: traveler
      ? { ...traveler, passportNo: "" } // masked on the server; leave blank to keep the stored number
      : { relation: "SELF", nationality: "IN" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync({ customerId, travelerId: traveler?.id, input: values });
      toast.success(traveler ? "Traveller updated" : "Traveller added");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Title" placeholder="Mr / Mrs / Ms" {...register("title")} />
        <TextField label="First name" required autoFocus error={formState.errors.firstName?.message} {...register("firstName")} />
        <TextField label="Last name" {...register("lastName")} />
        <SelectField label="Gender" {...register("gender", { setValueAs: (v) => v || null })}>
          <option value="">—</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g === "MALE" ? "Male" : "Female"}
            </option>
          ))}
        </SelectField>
        <TextField label="Date of birth" type="date" error={formState.errors.dob?.message} {...register("dob")} />
        <SelectField label="Relation" {...register("relation")}>
          {TRAVELER_RELATIONS.map((r) => (
            <option key={r} value={r}>
              {TRAVELER_RELATION_LABELS[r]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-3">
        <TextField
          label="Passport number"
          placeholder={traveler?.passportNo ? `${traveler.passportNo} (unchanged)` : "e.g. Z1234567"}
          hint="Stored encrypted"
          autoComplete="off"
          error={formState.errors.passportNo?.message}
          {...register("passportNo")}
        />
        <TextField label="Passport expiry" type="date" error={formState.errors.passportExpiry?.message} {...register("passportExpiry")} />
        <TextField label="Place of issue" {...register("passportIssuePlace")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Meal preference" placeholder="e.g. Vegetarian, diabetic" {...register("mealPreference")} />
        <TextField label="Nationality (ISO code)" maxLength={2} {...register("nationality")} />
      </div>
      <TextareaField label="Special needs" hint="Wheelchair, medical conditions, etc." {...register("specialNeeds")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          {traveler ? "Save traveller" : "Add traveller"}
        </Button>
      </div>
    </form>
  );
}
