import { zodResolver } from "@hookform/resolvers/zod";
import { packageInputSchema, PRODUCT_TYPE_LABELS, PRODUCT_TYPES, type PackageDetail } from "@mashkoor/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { useCreatePackage, usePackage, useUpdatePackage } from "../api";
import { PackageDeparturesSection } from "./PackageDeparturesSection";
import { useDestinationOptions } from "./useDestinationOptions";

type FormIn = z.input<typeof packageInputSchema>;
type FormOut = z.output<typeof packageInputSchema>;

export function PackageFormDialog({ open, onClose, packageId }: { open: boolean; onClose: () => void; packageId?: string }) {
  const { data: pkg, isLoading } = usePackage(packageId ?? "");
  return (
    <Dialog open={open} onClose={onClose} title={packageId ? "Edit package" : "New package"} size="lg">
      {(!packageId || (!isLoading && pkg)) && <PackageForm pkg={pkg} onDone={onClose} />}
    </Dialog>
  );
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function PackageForm({ pkg, onDone }: { pkg?: PackageDetail; onDone: () => void }) {
  const create = useCreatePackage();
  const update = useUpdatePackage();
  const destinations = useDestinationOptions();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, setError, control, watch, setValue, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(packageInputSchema),
    defaultValues: pkg
      ? { ...pkg, destinationId: pkg.destination?.id ?? null }
      : { productType: "HOLIDAY", published: false, featured: false, sortOrder: 0, itinerary: [], hotels: [], priceTiers: [], galleryUrls: [], highlights: [], inclusions: [], exclusions: [] },
  });
  const itinerary = useFieldArray({ control, name: "itinerary" });
  const hotels = useFieldArray({ control, name: "hotels" });
  const priceTiers = useFieldArray({ control, name: "priceTiers" });
  const title = watch("title");

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (pkg) await update.mutateAsync({ id: pkg.id, input: values });
      else await create.mutateAsync(values);
      toast.success(pkg ? "Package updated" : "Package created");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError message={formError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Title" required autoFocus error={formState.errors.title?.message} {...register("title")} onBlur={(e) => !pkg && !watch("slug") && setValue("slug", slugify(e.target.value))} />
        <TextField label="Slug" required hint="Used in the website URL" error={formState.errors.slug?.message} {...register("slug")} />
        <SelectField label="Product" {...register("productType")}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Destination" {...register("destinationId", { setValueAs: (v) => v || null })}>
          <option value="">— None —</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Nights" type="number" min={0} {...register("nights")} />
        <TextField label="Days" type="number" min={0} {...register("days")} />
        <TextField label="Hero image URL" className="sm:col-span-2" {...register("heroImageUrl")} />
      </div>

      <TextareaField label="Summary" hint="Shown on listing cards" {...register("summary")} />
      <TextareaField label="Description" rows={5} {...register("description")} />

      {/* Day plan */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-700">Day plan</h3>
          <Button type="button" variant="secondary" size="sm" onClick={() => itinerary.append({ day: itinerary.fields.length + 1, title: "", description: "" })}>
            <Plus className="h-4 w-4" aria-hidden /> Add day
          </Button>
        </div>
        <div className="space-y-3">
          {itinerary.fields.map((f, i) => (
            <div key={f.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex gap-2">
                <input type="number" min={1} className={`${inputClass} w-20`} aria-label="Day number" {...register(`itinerary.${i}.day`)} />
                <input placeholder="Title, e.g. Arrival in Jeddah" className={inputClass} aria-label="Day title" {...register(`itinerary.${i}.title`)} />
                <Button type="button" variant="ghost" size="sm" onClick={() => itinerary.remove(i)} aria-label="Remove day">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <textarea rows={2} placeholder="What happens this day" className={inputClass} aria-label="Day description" {...register(`itinerary.${i}.description`)} />
            </div>
          ))}
          {itinerary.fields.length === 0 && <p className="text-sm text-ink-500">No days added yet.</p>}
        </div>
      </div>

      {/* Hotels shown for marketing */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-700">Hotels</h3>
          <Button type="button" variant="secondary" size="sm" onClick={() => hotels.append({ city: "", hotelName: "", nights: 1, roomType: "", mealPlan: "" })}>
            <Plus className="h-4 w-4" aria-hidden /> Add hotel
          </Button>
        </div>
        <div className="space-y-2">
          {hotels.fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1fr_1fr_5rem_1fr_1fr_auto] gap-2">
              <input placeholder="City" className={inputClass} aria-label="City" {...register(`hotels.${i}.city`)} />
              <input placeholder="Hotel name" className={inputClass} aria-label="Hotel name" {...register(`hotels.${i}.hotelName`)} />
              <input type="number" min={1} placeholder="Nights" className={inputClass} aria-label="Nights" {...register(`hotels.${i}.nights`)} />
              <input placeholder="Room type" className={inputClass} aria-label="Room type" {...register(`hotels.${i}.roomType`)} />
              <input placeholder="Meal plan" className={inputClass} aria-label="Meal plan" {...register(`hotels.${i}.mealPlan`)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => hotels.remove(i)} aria-label="Remove hotel">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
          {hotels.fields.length === 0 && <p className="text-sm text-ink-500">No hotels added yet.</p>}
        </div>
      </div>

      {/* Price tiers */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-700">Price tiers</h3>
          <Button type="button" variant="secondary" size="sm" onClick={() => priceTiers.append({ label: "", adultPrice: 0, childPrice: null, currency: "INR" })}>
            <Plus className="h-4 w-4" aria-hidden /> Add tier
          </Button>
        </div>
        <div className="space-y-2">
          {priceTiers.fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1.5fr_1fr_1fr_auto] gap-2">
              <input placeholder="Label, e.g. Standard triple sharing" className={inputClass} aria-label="Tier label" {...register(`priceTiers.${i}.label`)} />
              <input type="number" min={0} placeholder="Adult price" className={inputClass} aria-label="Adult price" {...register(`priceTiers.${i}.adultPrice`)} />
              <input type="number" min={0} placeholder="Child price" className={inputClass} aria-label="Child price" {...register(`priceTiers.${i}.childPrice`)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => priceTiers.remove(i)} aria-label="Remove tier">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
          {priceTiers.fields.length === 0 && <p className="text-sm text-ink-500">No price tiers yet — the package will show "Price on request".</p>}
        </div>
      </div>

      {pkg ? <PackageDeparturesSection packageId={pkg.id} /> : <p className="text-xs text-ink-500">Save the package first, then reopen it to add departures.</p>}

      <div className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-2">
        <TextField label="SEO title" defaultValue={title} {...register("seoTitle")} />
        <TextField label="SEO description" {...register("seoDescription")} />
      </div>
      <div className="flex gap-4">
        <CheckboxField label="Published on the website" {...register("published")} />
        <CheckboxField label="Featured" {...register("featured")} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Save package
        </Button>
      </div>
    </form>
  );
}
