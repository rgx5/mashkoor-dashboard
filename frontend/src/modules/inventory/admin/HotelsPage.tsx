import { zodResolver } from "@hookform/resolvers/zod";
import { hotelInputSchema, MEAL_PLAN_LABELS, MEAL_PLANS, roomTypeInputSchema, type HotelData, type HotelRow, type RoomTypeRow } from "@mashkoor/shared";
import { Building2, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, FormError, inputClass, SelectField, TextField } from "@/core/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useCreateHotel, useCreateRoomType, useDeleteHotel, useHotel, useHotels, useUpdateHotel } from "../api";
import { RoomTypeSection } from "./RoomTypeSection";

type HotelFormIn = z.input<typeof hotelInputSchema>;
type HotelFormOut = z.output<typeof hotelInputSchema>;

export function HotelsPage() {
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<HotelRow | "new" | null>(null);
  const remove = useDeleteHotel();
  const page = Number(params.get("page") ?? 1);
  const { data, isLoading, error } = useHotels({ page, pageSize: 25, q: params.get("q") ?? undefined });

  return (
    <>
      <PageHeader
        title="Hotels"
        description="Room types and rate periods used when booking hotel stays."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New hotel
          </Button>
        }
      >
        <input type="search" placeholder="Search hotels or cities" defaultValue={params.get("q") ?? ""} onChange={(e) => setParams({ q: e.target.value })} className={`${inputClass} mb-4 max-w-sm`} />
      </PageHeader>

      {isLoading && (
        <div className="flex justify-center py-14">
          <Spinner />
        </div>
      )}
      {error && <p className="py-10 text-center text-sm text-red-600">{errorMessage(error)}</p>}
      {!isLoading && data?.data.length === 0 && <EmptyState icon={Building2} title="No hotels yet" />}

      <div className="space-y-3">
        {data?.data.map((hotel) => (
          <Card key={hotel.id} className="overflow-hidden">
            <button type="button" onClick={() => setExpanded((e) => (e === hotel.id ? null : hotel.id))} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface/60">
              <span className="flex items-center gap-2">
                {expanded === hotel.id ? <ChevronDown className="h-4 w-4 text-ink-300" aria-hidden /> : <ChevronRight className="h-4 w-4 text-ink-300" aria-hidden />}
                <span>
                  <span className="font-semibold">{hotel.name}</span>
                  <span className="ml-2 text-sm text-ink-500">
                    {hotel.city}, {hotel.country} {hotel.category ? `· ${hotel.category}★` : ""}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-3">
                <Badge tone={hotel.active ? "green" : "neutral"}>{hotel.active ? "Active" : "Inactive"}</Badge>
                <span className="text-xs text-ink-500">{hotel.roomTypeCount} room type(s)</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => (e.stopPropagation(), setEditing(hotel))}
                  onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), setEditing(hotel))}
                  className="rounded p-1.5 text-ink-500 hover:bg-white hover:text-plum-700"
                  aria-label="Edit hotel"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete ${hotel.name}?`)) withToast(remove.mutateAsync(hotel.id), "Hotel deleted");
                  }}
                  className="rounded p-1.5 text-ink-500 hover:bg-white hover:text-red-600"
                  aria-label="Delete hotel"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </span>
              </span>
            </button>
            {expanded === hotel.id && <HotelExpansion hotelId={hotel.id} />}
          </Card>
        ))}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? "Edit hotel" : "New hotel"} size="lg">
        {editing !== null && <HotelForm hotel={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function HotelExpansion({ hotelId }: { hotelId: string }) {
  const { data: hotel, isLoading } = useHotel(hotelId);
  const [addingRoomType, setAddingRoomType] = useState(false);

  if (isLoading || !hotel)
    return (
      <div className="flex justify-center border-t border-line py-6">
        <Spinner />
      </div>
    );

  return (
    <div className="border-t border-line bg-surface/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-700">Room types</h3>
        <Button size="sm" variant="secondary" onClick={() => setAddingRoomType(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add room type
        </Button>
      </div>
      {hotel.roomTypes.length === 0 && <p className="text-sm text-ink-500">No room types yet.</p>}
      <div className="space-y-3">
        {hotel.roomTypes.map((rt: RoomTypeRow) => (
          <RoomTypeSection key={rt.id} roomType={rt} />
        ))}
      </div>
      <Dialog open={addingRoomType} onClose={() => setAddingRoomType(false)} title="Add room type">
        <RoomTypeForm hotelId={hotelId} onDone={() => setAddingRoomType(false)} />
      </Dialog>
    </div>
  );
}

function HotelForm({ hotel, onDone }: { hotel?: HotelRow; onDone: () => void }) {
  const create = useCreateHotel();
  const update = useUpdateHotel();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<HotelFormIn, unknown, HotelFormOut>({
    resolver: zodResolver(hotelInputSchema),
    defaultValues: hotel ?? { country: "SA", active: true },
  });

  const onSubmit = handleSubmit(async (values: HotelData) => {
    setFormError(null);
    try {
      if (hotel) await update.mutateAsync({ id: hotel.id, input: values });
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
        <TextField label="Hotel name" required autoFocus error={formState.errors.name?.message} {...register("name")} />
        <TextField label="City" required error={formState.errors.city?.message} {...register("city")} />
        <TextField label="Country code" hint="e.g. SA, AE, IN" {...register("country")} />
        <TextField label="Star category" type="number" min={1} max={7} {...register("category", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
        <TextField label="Phone" {...register("phone")} />
        <TextField label="Address" className="sm:col-span-2" {...register("address")} />
      </div>
      <CheckboxField label="Active" {...register("active")} />
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

type RoomTypeFormIn = z.input<typeof roomTypeInputSchema>;
type RoomTypeFormOut = z.output<typeof roomTypeInputSchema>;

function RoomTypeForm({ hotelId, onDone }: { hotelId: string; onDone: () => void }) {
  const create = useCreateRoomType();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<RoomTypeFormIn, unknown, RoomTypeFormOut>({
    resolver: zodResolver(roomTypeInputSchema),
    defaultValues: { hotelId, maxAdults: 2, maxChildren: 1, mealPlan: "BREAKFAST", active: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success("Room type added");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <TextField label="Name" required autoFocus placeholder="e.g. Deluxe Triple, Haram View" error={formState.errors.name?.message} {...register("name")} />
      <div className="grid grid-cols-3 gap-3">
        <TextField label="Max adults" type="number" min={1} {...register("maxAdults")} />
        <TextField label="Max children" type="number" min={0} {...register("maxChildren")} />
        <SelectField label="Meal plan" {...register("mealPlan")}>
          {MEAL_PLANS.map((m) => (
            <option key={m} value={m}>
              {MEAL_PLAN_LABELS[m]}
            </option>
          ))}
        </SelectField>
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
