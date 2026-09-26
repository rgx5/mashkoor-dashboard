import { zodResolver } from "@hookform/resolvers/zod";
import {
  PRICING_ADJUSTMENT_TYPE_LABELS,
  PRICING_ADJUSTMENT_TYPES,
  PRICING_SCOPES,
  pricingRuleInputSchema,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  type PriceQuoteResult,
  type PricingRule,
} from "@mashkoor/shared";
import { Calculator, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { formatDate, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { CheckboxField, Field, FormError, inputClass, SelectField, TextField } from "@/core/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useCreatePricingRule, useDeletePricingRule, usePriceQuote, usePricingRules, useUpdatePricingRule } from "../api";

type FormIn = z.input<typeof pricingRuleInputSchema>;
type FormOut = z.output<typeof pricingRuleInputSchema>;

export function PricingRulesPage() {
  const { data, isLoading, error } = usePricingRules();
  const [editing, setEditing] = useState<PricingRule | "new" | null>(null);
  const remove = useDeletePricingRule();

  return (
    <>
      <PageHeader
        title="Pricing rules"
        description="Turns a cost price into a selling price. The last matching active rule, by priority, wins."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> New rule
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          {isLoading && (
            <div className="flex justify-center py-14">
              <Spinner />
            </div>
          )}
          {error && <p className="py-10 text-center text-sm text-red-600">{errorMessage(error)}</p>}
          {!isLoading && data?.length === 0 && <EmptyState icon={Tags} title="No pricing rules yet" description="Without a rule, the selling price equals the cost price." />}
          <div className="space-y-2">
            {data?.map((rule) => (
              <Card key={rule.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{rule.name}</span>
                    <Badge tone={rule.scope === "B2B" ? "plum" : "neutral"}>{rule.scope}</Badge>
                    {!rule.active && <Badge tone="red">Inactive</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {rule.productType ? PRODUCT_TYPE_LABELS[rule.productType] : "All trip types"} · {PRICING_ADJUSTMENT_TYPE_LABELS[rule.adjustmentType]}:{" "}
                    {rule.adjustmentType === "PERCENT_MARKUP" ? `${rule.value}%` : formatINR(rule.value)} · priority {rule.priority}
                    {(rule.validFrom || rule.validTo) && (
                      <>
                        {" "}
                        · {rule.validFrom ? formatDate(rule.validFrom) : "…"} – {rule.validTo ? formatDate(rule.validTo) : "…"}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(rule)} aria-label="Edit">
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => window.confirm(`Delete "${rule.name}"?`) && withToast(remove.mutateAsync(rule.id), "Rule deleted")}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
        <Calculator2 />
      </div>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? "Edit pricing rule" : "New pricing rule"} size="lg">
        {editing !== null && <RuleForm rule={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function Calculator2() {
  const quote = usePriceQuote();
  const [scope, setScope] = useState<(typeof PRICING_SCOPES)[number]>("B2C");
  const [productType, setProductType] = useState<(typeof PRODUCT_TYPES)[number]>("HOLIDAY");
  const [costPrice, setCostPrice] = useState("");
  const [result, setResult] = useState<PriceQuoteResult | null>(null);

  const run = async () => {
    const cost = Number(costPrice);
    if (!cost) return;
    try {
      setResult(await quote.mutateAsync({ scope, productType, costPrice: cost, date: null }));
    } catch {
      /* shown via toast below */
    }
  };

  return (
    <Card className="h-fit p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Calculator className="h-4 w-4" aria-hidden /> Calculator
      </h2>
      <div className="space-y-3">
        <Field label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={inputClass}>
            {PRICING_SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product">
          <select value={productType} onChange={(e) => setProductType(e.target.value as typeof productType)} className={inputClass}>
            {PRODUCT_TYPES.map((p) => (
              <option key={p} value={p}>
                {PRODUCT_TYPE_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <TextField label="Cost price (₹)" type="number" min={0} value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        <Button className="w-full" onClick={run} loading={quote.isPending}>
          Calculate
        </Button>
        {quote.error && <p className="text-sm text-red-600">{errorMessage(quote.error)}</p>}
        {result && (
          <div className="rounded-lg bg-surface p-3 text-sm">
            <p className="flex justify-between">
              <span className="text-ink-500">Sell price</span> <span className="font-semibold">{formatINR(result.sellPrice)}</span>
            </p>
            <p className={cn("flex justify-between", result.margin < 0 && "text-red-600")}>
              <span className="text-ink-500">Margin</span>{" "}
              <span className="font-semibold">
                {formatINR(result.margin)} ({result.marginPercent}%)
              </span>
            </p>
            <p className="mt-1 text-xs text-ink-500">{result.appliedRule ? `Rule applied: ${result.appliedRule.name}` : "No matching rule — sell price equals cost"}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function RuleForm({ rule, onDone }: { rule?: PricingRule; onDone: () => void }) {
  const create = useCreatePricingRule();
  const update = useUpdatePricingRule();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(pricingRuleInputSchema),
    defaultValues: rule ?? { scope: "B2C", adjustmentType: "PERCENT_MARKUP", value: 15, priority: 0, active: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (rule) await update.mutateAsync({ id: rule.id, input: values });
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
      <TextField label="Rule name" required autoFocus error={formState.errors.name?.message} {...register("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Scope" {...register("scope")}>
          {PRICING_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <SelectField label="Product" {...register("productType", { setValueAs: (v) => v || null })}>
          <option value="">All trip types</option>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Adjustment" {...register("adjustmentType")}>
          {PRICING_ADJUSTMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {PRICING_ADJUSTMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <TextField label="Value" type="number" min={0} required hint="Percent, or a rupee amount" error={formState.errors.value?.message} {...register("value")} />
        <TextField label="Priority" type="number" min={0} hint="Higher wins when rules tie" {...register("priority")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Valid from" type="date" {...register("validFrom")} />
        <TextField label="Valid to" type="date" {...register("validTo")} />
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
