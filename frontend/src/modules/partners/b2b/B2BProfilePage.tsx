import { zodResolver } from "@hookform/resolvers/zod";
import { partnerUpdateSchema, type PartnerDetail } from "@mashkoor/shared";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { FormError, TextareaField, TextField } from "@/core/ui/form";
import { Card, PageHeader } from "@/core/ui/layout";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { useMyProfile, useUpdateMyProfile } from "./api";

const b2bProfileSchema = partnerUpdateSchema.omit({ creditLimit: true, kycDocuments: true });
type FormIn = z.input<typeof b2bProfileSchema>;
type FormOut = z.output<typeof b2bProfileSchema>;

export function B2BProfilePage() {
  const { data: profile, isLoading } = useMyProfile();
  const update = useUpdateMyProfile();
  if (isLoading || !profile) return <FullPageSpinner />;

  return <ProfileForm profile={profile} onSave={(values) => update.mutateAsync(values)} />;
}

function ProfileForm({ profile, onSave }: { profile: PartnerDetail; onSave: (values: FormOut) => Promise<unknown> }) {
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(b2bProfileSchema),
    defaultValues: profile,
  });
  const submitFormError = formState.errors.root?.message;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await onSave(values);
      toast.success("Profile updated");
    } catch (error) {
      setError("root", { message: applyApiErrors(error, setError) });
    }
  });

  return (
    <>
      <PageHeader title="Agency profile" description="Your company details on file with Mashkoor." />
      <Card className="p-5 sm:p-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={submitFormError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Company name" required error={formState.errors.companyName?.message} {...register("companyName")} />
            <TextField label="Contact name" required error={formState.errors.contactName?.message} {...register("contactName")} />
            <TextField label="Phone" type="tel" error={formState.errors.phone?.message} {...register("phone")} />
            <TextField label="Email" type="email" error={formState.errors.email?.message} {...register("email")} />
            <TextField label="City" {...register("city")} />
            <TextField label="State" {...register("state")} />
            <TextField label="GST number" {...register("gstNumber")} />
            <TextField label="PAN number" {...register("panNumber")} />
          </div>
          <TextareaField label="Notes" hint="Anything else Mashkoor's team should know" {...register("notes")} />
          <div className="flex justify-end pt-2">
            <Button type="submit" loading={formState.isSubmitting}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
