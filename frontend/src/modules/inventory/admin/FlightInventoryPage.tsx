import { zodResolver } from "@hookform/resolvers/zod";
import { CABIN_CLASS_LABELS, CABIN_CLASSES, flightSeatBlockInputSchema, type FlightSeatBlockRow } from "@mashkoor/shared";
import { Plane, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { formatDateTime, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useCreateFlightSeatBlock, useDeleteFlightSeatBlock, useFlightSeatBlocks } from "../api";

type FormIn = z.input<typeof flightSeatBlockInputSchema>;
type FormOut = z.output<typeof flightSeatBlockInputSchema>;

export function FlightInventoryPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const remove = useDeleteFlightSeatBlock();
  const page = Number(params.get("page") ?? 1);
  const { data, isLoading, error } = useFlightSeatBlocks({ page, pageSize: 25, q: params.get("q") ?? undefined });

  const columns: Column<FlightSeatBlockRow>[] = [
    {
      key: "flight",
      header: "Flight",
      cell: (f) => (
        <div>
          <span className="font-semibold">
            {f.airline} {f.flightNumber}
          </span>
          <span className="block text-xs text-ink-500">
            {f.origin} → {f.destination}
          </span>
        </div>
      ),
    },
    { key: "departure", header: "Departure", cell: (f) => formatDateTime(f.departureAt) },
    { key: "cabin", header: "Cabin", cell: (f) => CABIN_CLASS_LABELS[f.cabinClass] },
    { key: "cost", header: "Cost/seat", cell: (f) => formatINR(f.costPrice) },
    { key: "available", header: "Available", cell: (f) => <Badge tone={f.available > 0 ? "green" : "red"}>{f.available}</Badge> },
    { key: "total", header: "Total seats", cell: (f) => f.totalSeats },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (f) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={f.bookedSeats > 0}
          title={f.bookedSeats > 0 ? "Seats from this flight are booked" : "Delete"}
          aria-label="Delete"
          onClick={() => window.confirm("Delete this flight seat block?") && withToast(remove.mutateAsync(f.id), "Deleted")}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Flight inventory"
        description="Seat blocks Mashkoor has bought and resells."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New seat block
          </Button>
        }
      >
        <input type="search" placeholder="Search airline or flight number" defaultValue={params.get("q") ?? ""} onChange={(e) => setParams({ q: e.target.value })} className={`${inputClass} mb-4 max-w-sm`} />
      </PageHeader>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(f) => f.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Plane, title: "No flight seat blocks yet" }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(p) }))}
      />
      <Dialog open={creating} onClose={() => setCreating(false)} title="New flight seat block" size="lg">
        <FlightSeatBlockForm onDone={() => setCreating(false)} />
      </Dialog>
    </>
  );
}

function FlightSeatBlockForm({ onDone }: { onDone: () => void }) {
  const create = useCreateFlightSeatBlock();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(flightSeatBlockInputSchema),
    defaultValues: { cabinClass: "ECONOMY" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync(values);
      toast.success("Seat block added");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Airline" required autoFocus error={formState.errors.airline?.message} {...register("airline")} />
        <TextField label="Flight number" required error={formState.errors.flightNumber?.message} {...register("flightNumber")} />
        <TextField label="Origin (IATA)" required maxLength={4} error={formState.errors.origin?.message} {...register("origin")} />
        <TextField label="Destination (IATA)" required maxLength={4} error={formState.errors.destination?.message} {...register("destination")} />
        <TextField label="Departure" type="datetime-local" required error={formState.errors.departureAt?.message} {...register("departureAt", { setValueAs: (v: string) => (v ? `${v}:00+05:30` : v) })} />
        <TextField label="Arrival" type="datetime-local" error={formState.errors.arrivalAt?.message} {...register("arrivalAt", { setValueAs: (v: string) => (v ? `${v}:00+05:30` : null) })} />
        <SelectField label="Cabin class" {...register("cabinClass")}>
          {CABIN_CLASSES.map((c) => (
            <option key={c} value={c}>
              {CABIN_CLASS_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <TextField label="Total seats" type="number" min={1} required error={formState.errors.totalSeats?.message} {...register("totalSeats")} />
        <TextField label="Cost per seat (₹)" type="number" min={0} required error={formState.errors.costPrice?.message} {...register("costPrice")} />
      </div>
      <TextareaField label="Notes" hint="Optional" {...register("notes")} />
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
