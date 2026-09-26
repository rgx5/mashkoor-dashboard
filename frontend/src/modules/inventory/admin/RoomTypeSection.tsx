import { zodResolver } from "@hookform/resolvers/zod";
import { MEAL_PLAN_LABELS, ratePeriodInputSchema, type RoomTypeRow } from "@mashkoor/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, withToast } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, TextField } from "@/core/ui/form";
import { Badge } from "@/core/ui/layout";
import { useCreateRatePeriod, useDeleteRatePeriod, useHotel } from "../api";

type FormIn = z.input<typeof ratePeriodInputSchema>;
type FormOut = z.output<typeof ratePeriodInputSchema>;

export function RoomTypeSection({ roomType }: { roomType: RoomTypeRow }) {
  const { data: hotel } = useHotel(roomType.hotelId);
  const remove = useDeleteRatePeriod();
  const [adding, setAdding] = useState(false);
  const periods = hotel?.roomTypes.find((rt) => rt.id === roomType.id)?.ratePeriods ?? [];

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className="font-semibold">{roomType.name}</span>
          <span className="ml-2 text-xs text-ink-500">
            {MEAL_PLAN_LABELS[roomType.mealPlan]} · Up to {roomType.maxAdults} adults, {roomType.maxChildren} children
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Rate period
        </Button>
      </div>
      {periods.length === 0 ? (
        <p className="text-xs text-ink-500">No rate periods yet.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-ink-500">
            <tr>
              <th className="py-1 pr-3 font-semibold">Dates</th>
              <th className="py-1 pr-3 font-semibold">Cost/night</th>
              <th className="py-1 pr-3 font-semibold">Rooms</th>
              <th className="py-1 pr-3 font-semibold">Available</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {periods.map((p) => (
              <tr key={p.id}>
                <td className="py-1.5 pr-3">
                  {formatDate(p.startDate)} – {formatDate(p.endDate)}
                </td>
                <td className="py-1.5 pr-3">{formatINR(p.costPrice)}</td>
                <td className="py-1.5 pr-3">{p.totalRooms}</td>
                <td className="py-1.5 pr-3">
                  <Badge tone={p.available > 0 ? "green" : "red"}>{p.available}</Badge>
                </td>
                <td className={cn("py-1.5 text-right", p.bookedRooms > 0 && "opacity-40")}>
                  <button
                    type="button"
                    disabled={p.bookedRooms > 0}
                    aria-label="Delete rate period"
                    title={p.bookedRooms > 0 ? "Rooms from this period are booked" : "Delete"}
                    onClick={() => window.confirm("Delete this rate period?") && withToast(remove.mutateAsync(p.id), "Rate period deleted")}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title={`Add rate period · ${roomType.name}`}>
        <RatePeriodForm roomTypeId={roomType.id} onDone={() => setAdding(false)} />
      </Dialog>
    </div>
  );
}

function RatePeriodForm({ roomTypeId, onDone }: { roomTypeId: string; onDone: () => void }) {
  const create = useCreateRatePeriod();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(ratePeriodInputSchema),
    defaultValues: { roomTypeId, totalRooms: 1 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success("Rate period added");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Start date" type="date" required autoFocus error={formState.errors.startDate?.message} {...register("startDate")} />
        <TextField label="End date" type="date" required error={formState.errors.endDate?.message} {...register("endDate")} />
        <TextField label="Cost per room/night (₹)" type="number" min={0} required error={formState.errors.costPrice?.message} {...register("costPrice")} />
        <TextField label="Total rooms" type="number" min={1} required error={formState.errors.totalRooms?.message} {...register("totalRooms")} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
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
