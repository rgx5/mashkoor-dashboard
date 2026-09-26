import { zodResolver } from "@hookform/resolvers/zod";
import { faqInputSchema, type Faq } from "@mashkoor/shared";
import { HelpCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, withToast } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, FormError, TextareaField, TextField } from "@/core/ui/form";
import { EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useCreateFaq, useDeleteFaq, useFaqs, useUpdateFaq } from "../api";

type FormIn = z.input<typeof faqInputSchema>;
type FormOut = z.output<typeof faqInputSchema>;

export function FaqsPage() {
  const { data, isLoading } = useFaqs();
  const [editing, setEditing] = useState<Faq | "new" | null>(null);
  const remove = useDeleteFaq();

  const grouped: Record<string, Faq[]> = {};
  for (const f of data ?? []) (grouped[f.category] ??= []).push(f);

  return (
    <>
      <PageHeader
        title="FAQs"
        description="Frequently asked questions shown on the website."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New FAQ
          </Button>
        }
      />
      {isLoading && (
        <div className="flex justify-center py-14">
          <Spinner />
        </div>
      )}
      {!isLoading && data?.length === 0 && <EmptyState icon={HelpCircle} title="No FAQs yet" />}
      <div className="space-y-6">
        {Object.entries(grouped).map(([category, faqs]) => (
          <div key={category}>
            <h2 className="mb-2 text-sm font-bold tracking-wide text-ink-500 uppercase">{category}</h2>
            <div className="divide-y divide-line rounded-xl border border-line bg-white">
              {faqs?.map((f) => (
                <div key={f.id} className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className={cn("font-semibold", !f.published && "text-ink-500")}>{f.question}</p>
                    <p className="mt-1 text-sm text-ink-500">{f.answer}</p>
                    {!f.published && <span className="mt-1 inline-block text-xs font-semibold text-gold-700">Draft</span>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(f)} aria-label="Edit">
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => window.confirm("Delete this FAQ?") && withToast(remove.mutateAsync(f.id), "FAQ deleted")}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? "Edit FAQ" : "New FAQ"}>
        {editing !== null && <FaqForm faq={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function FaqForm({ faq, onDone }: { faq?: Faq; onDone: () => void }) {
  const create = useCreateFaq();
  const update = useUpdateFaq();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(faqInputSchema),
    defaultValues: faq ?? { category: "General", published: false, sortOrder: 0 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (faq) await update.mutateAsync({ id: faq.id, input: values });
      else await create.mutateAsync(values);
      toast.success("Saved");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <TextField label="Category" required error={formState.errors.category?.message} {...register("category")} />
      <TextField label="Question" required autoFocus error={formState.errors.question?.message} {...register("question")} />
      <TextareaField label="Answer" required rows={4} error={formState.errors.answer?.message} {...register("answer")} />
      <CheckboxField label="Published on the website" {...register("published")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
