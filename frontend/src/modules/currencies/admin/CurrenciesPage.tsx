import { zodResolver } from "@hookform/resolvers/zod";
import { BASE_CURRENCY, currencyInputSchema, type CurrencyRow } from "@mashkoor/shared";
import { Coins, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, FormError, TextField } from "@/core/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useCreateCurrency, useCurrencies, useDeleteCurrency, useUpdateCurrency } from "../api";

type FormIn = z.input<typeof currencyInputSchema>;
type FormOut = z.output<typeof currencyInputSchema>;

/** Currencies a quotation line can be priced in (a Saudi hotel billed in SAR, for example) and today's rate to INR. */
export function CurrenciesPage() {
  const { data, isLoading, error } = useCurrencies();
  const [editing, setEditing] = useState<CurrencyRow | "new" | null>(null);
  const update = useUpdateCurrency();
  const remove = useDeleteCurrency();

  return (
    <>
      <PageHeader
        title="Currencies"
        description="Rates to INR, used when a quotation line is priced in a supplier's own currency. Changing a rate here only affects new lines — existing quotations keep the rate they were priced at."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New currency
          </Button>
        }
      />
      {isLoading && (
        <div className="flex justify-center py-14">
          <Spinner />
        </div>
      )}
      {error && <p className="py-10 text-center text-sm text-red-600">{errorMessage(error)}</p>}
      {!isLoading && data?.length === 0 && <EmptyState icon={Coins} title="No currencies yet" description="INR is always available; add another to price a line in a supplier's own currency." />}
      <div className="space-y-2">
        {data?.map((c) => (
          <Card key={c.code} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {c.code} <span className="font-normal text-ink-500">· {c.name}</span>
                </span>
                {c.code === BASE_CURRENCY && <Badge tone="plum">Base</Badge>}
                {!c.active && <Badge tone="red">Inactive</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-500">
                {c.symbol} 1 = {"₹"}
                {c.rateToInr.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {c.code !== BASE_CURRENCY && (
                <button type="button" onClick={() => withToast(update.mutateAsync({ code: c.code, input: { active: !c.active } }), c.active ? "Marked inactive" : "Marked active")}>
                  <Badge tone={c.active ? "green" : "neutral"}>{c.active ? "Bookable" : "Off"}</Badge>
                </button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label="Edit">
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              {c.code !== BASE_CURRENCY && (
                <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => window.confirm(`Delete ${c.code}? Quotations already priced in it keep their numbers.`) && withToast(remove.mutateAsync(c.code), "Currency deleted")}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? `Edit ${editing.code}` : "New currency"}>
        {editing !== null && <CurrencyForm currency={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function CurrencyForm({ currency, onDone }: { currency?: CurrencyRow; onDone: () => void }) {
  const create = useCreateCurrency();
  const update = useUpdateCurrency();
  const [formError, setFormError] = useState<string | null>(null);
  const isBase = currency?.code === BASE_CURRENCY;
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(currencyInputSchema),
    defaultValues: currency ?? { active: true, rateToInr: 1 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (currency) await update.mutateAsync({ code: currency.code, input: values });
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
        <TextField label="Code" hint="3 letters, e.g. SAR" required autoFocus disabled={Boolean(currency)} maxLength={3} error={formState.errors.code?.message} {...register("code")} />
        <TextField label="Symbol" hint="e.g. ﷼" required error={formState.errors.symbol?.message} {...register("symbol")} />
      </div>
      <TextField label="Name" required error={formState.errors.name?.message} {...register("name")} />
      <TextField label="Rate to INR" type="number" min={0} step="0.0001" required disabled={isBase} hint={isBase ? "INR is always rate 1" : "How many rupees equal 1 unit of this currency"} error={formState.errors.rateToInr?.message} {...register("rateToInr")} />
      <CheckboxField label="Active" disabled={isBase} {...register("active")} />
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
