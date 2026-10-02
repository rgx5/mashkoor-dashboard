import { zodResolver } from "@hookform/resolvers/zod";
import { createStaffUserSchema, ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES, type CreateStaffUserInput } from "@mashkoor/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { toast } from "sonner";
import { ApiError } from "@/core/api/client";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextField } from "@/core/ui/form";
import { useInviteStaff } from "../api";

export function InviteUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add staff member" description="Set a password for them now, or leave it blank and they'll get an email to set their own.">
      <InviteForm onDone={onClose} />
    </Dialog>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const invite = useInviteStaff();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, watch, formState } = useForm<z.input<typeof createStaffUserSchema>, unknown, CreateStaffUserInput>({
    resolver: zodResolver(createStaffUserSchema),
    defaultValues: { role: "SALES_AGENT" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await invite.mutateAsync(values);
      toast.success(values.password ? `${values.name} can sign in now` : `Invitation sent to ${values.email}`);
      onDone();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) setError(field as keyof CreateStaffUserInput, { message });
        setFormError(error.message);
      } else setFormError("Unable to send the invitation.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <TextField label="Full name" required autoFocus error={formState.errors.name?.message} {...register("name")} />
      <TextField label="Email" type="email" required error={formState.errors.email?.message} {...register("email")} />
      <TextField label="Mobile" type="tel" hint="Optional" error={formState.errors.phone?.message} {...register("phone")} />
      <SelectField label="Role" required error={formState.errors.role?.message} {...register("role")}>
        {STAFF_ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Password"
        type="text"
        autoComplete="off"
        hint="Optional. At least 10 characters with a letter and a number. Tell them the password yourself — no email is sent when you set one."
        error={formState.errors.password?.message}
        {...register("password")}
      />
      <p className="-mt-2 rounded-lg bg-plum-50 px-3 py-2 text-xs text-plum-800">{ROLE_DESCRIPTIONS[watch("role") ?? "SALES_AGENT"]}</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          {watch("password") ? "Create user" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
