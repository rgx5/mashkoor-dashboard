import { zodResolver } from "@hookform/resolvers/zod";
import { BASE_CURRENCY, transportOptionInputSchema, type TransportOptionRow } from "@mashkoor/shared";
import { ArrowRight, Bus, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useCurrencies } from "@/modules/currencies";
import { useCreateTransportOption, useDeleteTransportOption, useTransportOptions, useUpdateTransportOption } from "../api";

type FormIn = z.input<typeof transportOptionInputSchema>;
type FormOut = z.output<typeof transportOptionInputSchema>;

/** The vehicles and routes Mashkoor can quote, each with a price per vehicle. Staff pick from this list inside a quotation. */
export function TransportPage() {
  const ability = useAbility("admin");
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<TransportOptionRow | "new" | null>(null);
  const remove = useDeleteTransportOption();
  const page = Number(params.get("page") ?? 1);
  const q = params.get("q") ?? "";
  const { data, isLoading, error } = useTransportOptions({ page, pageSize: 25, q: q || undefined });
  const canManage = ability.can("manage", "TransportOption");

  const columns: Column<TransportOptionRow>[] = [
    {
      key: "route",
      header: "Route",
      cell: (t) => (
        <span className="flex items-center gap-1.5 font-semibold">
          {t.fromPlace} <ArrowRight className="h-3.5 w-3.5 text-ink-500" aria-hidden /> {t.toPlace}
        </span>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      cell: (t) => (
        <div>
          <span className="font-medium">{t.vehicleType}</span>
          <span className="block text-xs text-ink-500">{t.seats} seats</span>
        </div>
      ),
    },
    ...(canManage
      ? [
          {
            key: "cost",
            header: "Cost per vehicle",
            className: "text-right",
            cell: (t: TransportOptionRow) => (
              <div className="tabular-nums">
                {formatINR(t.costPrice)}
                {t.currency !== BASE_CURRENCY && t.foreignAmount != null && (
                  <span className="block text-[11px] text-ink-500">
                    {t.currency} {t.foreignAmount.toLocaleString("en-IN")} @ ₹{t.fxRate}
                  </span>
                )}
              </div>
            ),
          },
        ]
      : []),
    { key: "status", header: "Status", cell: (t) => <Badge tone={t.active ? "green" : "neutral"}>{t.active ? "Active" : "Hidden"}</Badge> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (t) =>
        canManage && (
          <span className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" aria-label={`Edit ${t.vehicleType}`} onClick={() => setEditing(t)}>
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Delete ${t.vehicleType}`} onClick={() => window.confirm(`Delete ${t.vehicleType}, ${t.fromPlace} to ${t.toPlace}?`) && withToast(remove.mutateAsync(t.id), "Deleted")}>
              <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Transport"
        description="Vehicles and routes with a price per vehicle. Pick them from a quotation."
        actions={
          ability.can("create", "TransportOption") && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden /> New transport option
            </Button>
          )
        }
      >
        <input type="search" placeholder="Search vehicle or place" aria-label="Search transport" defaultValue={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} className={inputClass} />
      </PageHeader>
      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(t) => t.id}
        loading={isLoading}
        error={error ? errorMessage(error) : null}
        empty={{ icon: Bus, title: "No transport options yet", description: "Add a vehicle and route, for example a Hyundai H1 from Jeddah airport to Makkah." }}
        page={page}
        pageSize={data?.meta.pageSize ?? 25}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setParams((prev) => new URLSearchParams({ ...Object.fromEntries(prev), page: String(p) }))}
      />
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New transport option" : "Edit transport option"} size="lg">
        {editing && <TransportForm option={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function TransportForm({ option, onDone }: { option: TransportOptionRow | null; onDone: () => void }) {
  const create = useCreateTransportOption();
  const update = useUpdateTransportOption();
  const { data: currencies = [] } = useCurrencies();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, setValue, watch, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(transportOptionInputSchema),
    defaultValues: option
      ? { vehicleType: option.vehicleType, fromPlace: option.fromPlace, toPlace: option.toPlace, seats: option.seats, costPrice: option.costPrice ?? 0, currency: option.currency, foreignAmount: option.foreignAmount, fxRate: option.fxRate, active: option.active, notes: option.notes }
      : { seats: 4, currency: BASE_CURRENCY, active: true },
  });
  const currency = watch("currency") ?? BASE_CURRENCY;
  const foreign = currency !== BASE_CURRENCY;
  const foreignAmount = watch("foreignAmount");
  const fxRate = watch("fxRate");

  // A price quoted in another currency fills in the rupee cost, rounded to a whole rupee.
  useEffect(() => {
    if (foreign) setValue("costPrice", foreignAmount != null && fxRate ? Math.round(Number(foreignAmount) * Number(fxRate)) : 0);
  }, [foreign, foreignAmount, fxRate, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (option) await update.mutateAsync({ id: option.id, input: values });
      else await create.mutateAsync(values);
      toast.success(option ? "Transport option saved" : "Transport option added");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Vehicle" required autoFocus placeholder="e.g. Hyundai H1" error={formState.errors.vehicleType?.message} {...register("vehicleType")} />
        <TextField label="Seats" type="number" min={1} required error={formState.errors.seats?.message} {...register("seats")} />
        <TextField label="From" required placeholder="e.g. Jeddah airport" error={formState.errors.fromPlace?.message} {...register("fromPlace")} />
        <TextField label="To" required placeholder="e.g. Makkah" error={formState.errors.toPlace?.message} {...register("toPlace")} />
        <SelectField
          label="Price currency"
          {...register("currency", {
            onChange: (e) => {
              const code = e.target.value as string;
              setValue("foreignAmount", null);
              setValue("fxRate", code === BASE_CURRENCY ? null : (currencies.find((c) => c.code === code)?.rateToInr ?? null));
            },
          })}
        >
          <option value={BASE_CURRENCY}>{BASE_CURRENCY} — Indian Rupee</option>
          {currencies
            .filter((c) => c.code !== BASE_CURRENCY)
            .map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
        </SelectField>
        {foreign ? (
          <TextField label={`Price per vehicle (${currency})`} type="number" min={0} step="0.01" required error={formState.errors.foreignAmount?.message} {...register("foreignAmount")} />
        ) : (
          <TextField label="Price per vehicle (₹)" type="number" min={0} required error={formState.errors.costPrice?.message} {...register("costPrice")} />
        )}
        {foreign && (
          <>
            <TextField label={`Rate (₹ per ${currency})`} type="number" min={0} step="0.0001" required error={formState.errors.fxRate?.message} {...register("fxRate")} />
            <p className="self-end rounded-lg bg-surface px-3 py-2.5 text-sm text-ink-700">
              Per vehicle in rupees: <span className="font-semibold">{formatINR(Number(watch("costPrice")) || 0)}</span>
            </p>
          </>
        )}
      </div>
      <TextareaField label="Notes" hint="Optional" rows={2} error={formState.errors.notes?.message} {...register("notes")} />
      <CheckboxField label="Offer this in quotations" {...register("active")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          {option ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}
