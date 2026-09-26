import { zodResolver } from "@hookform/resolvers/zod";
import { customerUpdateSchema, formatPhone, TRAVELER_RELATION_LABELS, travelerInputSchema, type CustomerDetail, type CustomerUpdateData, type TravelerInput } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { api } from "@/core/api/client";
import { applyApiErrors, withToast } from "@/core/api/errors";
import { formatDate } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextField } from "@/core/ui/form";
import { Card, PageHeader } from "@/core/ui/layout";
import { FullPageSpinner } from "@/core/ui/Spinner";

const b2c = api("b2c");
const key = ["b2c", "profile"] as const;

const useProfile = () => useQuery({ queryKey: key, queryFn: () => b2c.get<CustomerDetail>("/profile") });
function useProfileMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: key });
  return {
    update: useMutation({ mutationFn: (input: CustomerUpdateData) => b2c.patch<CustomerDetail>("/profile", input), onSuccess: invalidate }),
    addTraveler: useMutation({ mutationFn: (input: TravelerInput) => b2c.post<unknown>("/profile/travelers", input), onSuccess: invalidate }),
    removeTraveler: useMutation({ mutationFn: (id: string) => b2c.delete<void>(`/profile/travelers/${id}`), onSuccess: invalidate }),
  };
}

const profileSchema = customerUpdateSchema.pick({ fullName: true, altPhone: true, email: true, city: true, state: true });
type ProfileIn = z.input<typeof profileSchema>;
type ProfileOut = z.output<typeof profileSchema>;
type TravelerIn = z.input<typeof travelerInputSchema>;
type TravelerOut = z.output<typeof travelerInputSchema>;

export function B2CProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const { update, addTraveler, removeTraveler } = useProfileMutations();
  const [adding, setAdding] = useState(false);

  if (isLoading || !profile) return <FullPageSpinner />;

  return (
    <>
      <PageHeader title="My profile" />
      <ProfileForm profile={profile} onSave={(v) => update.mutateAsync(v)} />

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Family & travellers</h2>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add traveller
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {profile.travelers.map((t) => (
          <Card key={t.id} className="flex items-start justify-between p-4">
            <div>
              <p className="font-semibold">{[t.title, t.firstName, t.lastName].filter(Boolean).join(" ")}</p>
              <p className="text-xs text-ink-500">
                {TRAVELER_RELATION_LABELS[t.relation]}
                {t.dob ? ` · Born ${formatDate(t.dob)}` : ""}
              </p>
              {t.passportNo && <p className="mt-1 font-mono text-xs text-ink-500">Passport {t.passportNo}</p>}
            </div>
            <Button variant="ghost" size="sm" aria-label="Remove traveller" onClick={() => window.confirm(`Remove ${t.firstName}?`) && withToast(removeTraveler.mutateAsync(t.id), "Traveller removed")}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </Card>
        ))}
      </div>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add traveller" description="Details as they appear on the passport.">
        <TravelerForm onSave={(v) => addTraveler.mutateAsync(v)} onDone={() => setAdding(false)} />
      </Dialog>
    </>
  );
}

function ProfileForm({ profile, onSave }: { profile: CustomerDetail; onSave: (values: ProfileOut) => Promise<unknown> }) {
  const { register, handleSubmit, setError, formState } = useForm<ProfileIn, unknown, ProfileOut>({ resolver: zodResolver(profileSchema), defaultValues: profile });
  const onSubmit = handleSubmit(async (values) => {
    try {
      await onSave(values);
      toast.success("Profile updated");
    } catch (error) {
      setError("root", { message: applyApiErrors(error, setError) });
    }
  });

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={formState.errors.root?.message} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" error={formState.errors.fullName?.message} {...register("fullName")} />
          <TextField label="Mobile" value={formatPhone(profile.phone)} disabled hint="Contact us to change your registered number" readOnly />
          <TextField label="Alternate mobile" type="tel" error={formState.errors.altPhone?.message} {...register("altPhone")} />
          <TextField label="Email" type="email" error={formState.errors.email?.message} {...register("email")} />
          <TextField label="City" {...register("city")} />
          <TextField label="State" {...register("state")} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={formState.isSubmitting}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TravelerForm({ onSave, onDone }: { onSave: (values: TravelerOut) => Promise<unknown>; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<TravelerIn, unknown, TravelerOut>({ resolver: zodResolver(travelerInputSchema), defaultValues: { relation: "SELF", nationality: "IN" } });
  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSave(values);
      toast.success("Traveller added");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="First name" required autoFocus error={formState.errors.firstName?.message} {...register("firstName")} />
        <TextField label="Last name" {...register("lastName")} />
        <TextField label="Date of birth" type="date" {...register("dob")} />
        <SelectField label="Relation" {...register("relation")}>
          {Object.entries(TRAVELER_RELATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="Passport number" autoComplete="off" hint="Stored encrypted" error={formState.errors.passportNo?.message} {...register("passportNo")} />
        <TextField label="Passport expiry" type="date" {...register("passportExpiry")} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Add
        </Button>
      </div>
    </form>
  );
}
