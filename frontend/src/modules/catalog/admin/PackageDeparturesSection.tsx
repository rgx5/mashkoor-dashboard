import { zodResolver } from "@hookform/resolvers/zod";
import { packageDepartureInputSchema } from "@mashkoor/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Badge } from "@/core/ui/layout";
import { CheckboxField, FormError, TextField } from "@/core/ui/form";
import { useCreateDeparture, useDeleteDeparture, usePackageDepartures, useUpdateDeparture } from "../api";

type FormIn = z.input<typeof packageDepartureInputSchema>;
type FormOut = z.output<typeof packageDepartureInputSchema>;

const numberOrNull = (v: string) => (v === "" || v == null ? null : Number(v));

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Fixed dates + seat counts a package can be booked and paid for directly on the website. A package with none of
 * these stays enquiry-only — this is deliberately opt-in per package, not every package needs fixed departures.
 */
export function PackageDeparturesSection({ packageId }: { packageId: string }) {
  const { data: departures } = usePackageDepartures(packageId);
  const remove = useDeleteDeparture(packageId);
  const toggleActive = useUpdateDeparture(packageId);

  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-ink-700">Departures</h3>
        <p className="text-xs text-ink-500">Add a fixed date and seat count to let customers book and pay for this trip directly on the website. Leave empty for a custom/FIT package — it stays enquiry-only.</p>
      </div>

      {departures && departures.length > 0 && (
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-500">
              <th className="pb-1 font-medium">Departs</th>
              <th className="pb-1 font-medium">Price / head</th>
              <th className="pb-1 font-medium">Deposit</th>
              <th className="pb-1 font-medium">Seats</th>
              <th className="pb-1 font-medium">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {departures.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className="py-1.5">{dateFmt.format(new Date(d.departureDate))}</td>
                <td className="py-1.5">{inr(d.pricePerHead)}</td>
                <td className="py-1.5">{d.depositPerHead ? inr(d.depositPerHead) : <span className="text-ink-400">Full amount</span>}</td>
                <td className="py-1.5">
                  {d.seatsLeft} / {d.totalSeats} left
                </td>
                <td className="py-1.5">
                  <button type="button" onClick={() => toggleActive.mutate({ id: d.id, input: { active: !d.active } })}>
                    <Badge tone={d.active ? "green" : "neutral"}>{d.active ? "Bookable" : "Off"}</Badge>
                  </button>
                </td>
                <td className="py-1.5 text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => (d.bookedSeats > 0 ? toast.error("This departure has bookings — mark it Off instead of deleting it") : remove.mutate(d.id))} aria-label="Remove departure">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <AddDepartureForm packageId={packageId} />
    </div>
  );
}

const emptyDeparture: FormIn = { departureDate: "", returnDate: null, pricePerHead: 0, depositPerHead: null, totalSeats: 10, active: true };

function AddDepartureForm({ packageId }: { packageId: string }) {
  const create = useCreateDeparture(packageId);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(packageDepartureInputSchema),
    defaultValues: emptyDeparture,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success("Departure added");
      reset(emptyDeparture);
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-dashed border-line p-3" noValidate>
      <FormError message={formError} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <TextField label="Departs" type="date" error={formState.errors.departureDate?.message} {...register("departureDate")} />
        <TextField label="Returns" type="date" {...register("returnDate", { setValueAs: (v) => v || null })} />
        <TextField label="Price / head" type="number" min={0} error={formState.errors.pricePerHead?.message} {...register("pricePerHead")} />
        <TextField label="Deposit / head" type="number" min={0} hint="Blank = pay in full" {...register("depositPerHead", { setValueAs: numberOrNull })} />
        <TextField label="Total seats" type="number" min={1} error={formState.errors.totalSeats?.message} {...register("totalSeats")} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <CheckboxField label="Bookable on the website" {...register("active")} />
        <Button type="submit" variant="secondary" size="sm" loading={formState.isSubmitting}>
          <Plus className="h-4 w-4" aria-hidden /> Add departure
        </Button>
      </div>
    </form>
  );
}
