import { zodResolver } from "@hookform/resolvers/zod";
import { PRODUCT_TYPE_LABELS, PRODUCT_TYPES, testimonialInputSchema, type Testimonial } from "@mashkoor/shared";
import { MessageSquareQuote, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, withToast } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useCreateTestimonial, useDeleteTestimonial, useTestimonials, useUpdateTestimonial } from "../api";

type FormIn = z.input<typeof testimonialInputSchema>;
type FormOut = z.output<typeof testimonialInputSchema>;

export function TestimonialsPage() {
  const { data, isLoading } = useTestimonials({ page: 1 });
  const [editing, setEditing] = useState<Testimonial | "new" | null>(null);
  const remove = useDeleteTestimonial();

  return (
    <>
      <PageHeader
        title="Testimonials"
        description="Customer quotes shown on the website."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New testimonial
          </Button>
        }
      />
      {isLoading && (
        <div className="flex justify-center py-14">
          <Spinner />
        </div>
      )}
      {!isLoading && data?.data.length === 0 && <EmptyState icon={MessageSquareQuote} title="No testimonials yet" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.data.map((t) => (
          <div key={t.id} className="rounded-xl border border-line bg-white p-4">
            <div className="mb-2 flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn("h-3.5 w-3.5", i < t.rating ? "fill-gold-400 text-gold-400" : "text-line")} aria-hidden />
              ))}
            </div>
            <p className="text-sm text-ink-700 italic">"{t.quote}"</p>
            <p className="mt-3 text-sm font-semibold">{t.customerName}</p>
            <p className="text-xs text-ink-500">
              {t.location} {t.productType ? `· ${PRODUCT_TYPE_LABELS[t.productType]}` : ""}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className={cn("text-xs font-semibold", t.published ? "text-emerald-600" : "text-ink-300")}>{t.published ? "Published" : "Draft"}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label="Edit">
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => window.confirm("Delete this testimonial?") && withToast(remove.mutateAsync(t.id), "Testimonial deleted")}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? "Edit testimonial" : "New testimonial"}>
        {editing !== null && <TestimonialForm testimonial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function TestimonialForm({ testimonial, onDone }: { testimonial?: Testimonial; onDone: () => void }) {
  const create = useCreateTestimonial();
  const update = useUpdateTestimonial();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(testimonialInputSchema),
    defaultValues: testimonial ?? { rating: 5, published: false, sortOrder: 0 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (testimonial) await update.mutateAsync({ id: testimonial.id, input: values });
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Customer name" required autoFocus error={formState.errors.customerName?.message} {...register("customerName")} />
        <TextField label="Location" hint="Optional" {...register("location")} />
        <SelectField label="Product" {...register("productType", { setValueAs: (v) => v || null })}>
          <option value="">— Any —</option>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <TextField label="Rating" type="number" min={1} max={5} {...register("rating")} />
      </div>
      <TextareaField label="Quote" required rows={4} error={formState.errors.quote?.message} {...register("quote")} />
      <TextField label="Photo URL" hint="Optional" {...register("photoUrl")} />
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
