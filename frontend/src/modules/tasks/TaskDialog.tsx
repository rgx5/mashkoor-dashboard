import { zodResolver } from "@hookform/resolvers/zod";
import { LEAD_PRIORITIES, type LeadPriority } from "@mashkoor/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { applyApiErrors } from "@/core/api/errors";
import { fromLocalInput, toLocalInput } from "@/core/format";
import { Can } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { StaffSelect } from "@/modules/users";
import { useCreateTask } from "./api";

const formSchema = z.object({
  title: z.string().trim().min(2, "Enter a task title").max(200),
  description: z.string().max(2000).optional(),
  dueAt: z.string().min(1, "Choose when it's due"),
  priority: z.enum(LEAD_PRIORITIES),
  assigneeId: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const tomorrowAt10 = () => {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d.toISOString());
};

export function TaskDialog({ open, onClose, leadId, customerId, defaultTitle }: { open: boolean; onClose: () => void; leadId?: string; customerId?: string; defaultTitle?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title="New follow-up task">
      <TaskForm leadId={leadId} customerId={customerId} defaultTitle={defaultTitle} onDone={onClose} />
    </Dialog>
  );
}

function TaskForm({ leadId, customerId, defaultTitle, onDone }: { leadId?: string; customerId?: string; defaultTitle?: string; onDone: () => void }) {
  const create = useCreateTask();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: defaultTitle ?? "Follow up", dueAt: tomorrowAt10(), priority: "WARM" as LeadPriority },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync({
        title: values.title,
        description: values.description || null,
        dueAt: fromLocalInput(values.dueAt)!,
        priority: values.priority,
        assigneeId: values.assigneeId || undefined,
        leadId: leadId ?? null,
        customerId: customerId ?? null,
      });
      toast.success("Task added");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <TextField label="Task" required autoFocus error={formState.errors.title?.message} {...register("title")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Due" type="datetime-local" required error={formState.errors.dueAt?.message} {...register("dueAt")} />
        <SelectField label="Priority" {...register("priority")}>
          <option value="HOT">Hot</option>
          <option value="WARM">Warm</option>
          <option value="COLD">Cold</option>
        </SelectField>
      </div>
      <Can portal="admin" I="manage" a="Task">
        <Field label="Assign to">
          <StaffSelect emptyLabel="Me" {...register("assigneeId")} />
        </Field>
      </Can>
      <TextareaField label="Details" hint="Optional" {...register("description")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Add task
        </Button>
      </div>
    </form>
  );
}
