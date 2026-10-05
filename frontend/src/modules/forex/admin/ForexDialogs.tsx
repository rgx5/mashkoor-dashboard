import { zodResolver } from "@hookform/resolvers/zod";
import {
  FOREX_FORM_LABELS,
  FOREX_FORMS,
  FOREX_PAN_THRESHOLD,
  forexInr,
  forexPurchaseInputSchema,
  forexTransactionInputSchema,
  FINANCE_METHODS,
  PAYMENT_METHOD_LABELS,
  type ForexPosition,
  type ForexType,
} from "@mashkoor/shared";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { applyApiErrors, errorMessage } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { useCustomer } from "@/modules/customers/api";
import { CustomerPicker } from "@/modules/customers/CustomerPicker";
import { useCancelForexPurchase, useCancelForexTransaction, useRecordForexPurchase, useRecordForexTransaction } from "../api";

type DealIn = z.input<typeof forexTransactionInputSchema>;
type DealOut = z.output<typeof forexTransactionInputSchema>;
type PurchaseIn = z.input<typeof forexPurchaseInputSchema>;
type PurchaseOut = z.output<typeof forexPurchaseInputSchema>;

const today = () => new Date().toISOString().slice(0, 10);
const num = (n: number, digits = 2) => n.toLocaleString("en-IN", { maximumFractionDigits: digits });
const PURPOSES = ["Umrah", "Hajj", "Tourism", "Business", "Education", "Medical", "Employment"];

export interface DealPreset {
  type?: ForexType;
  currency?: string;
}

/**
 * A deal at the counter: foreign currency sold to a customer (who pays rupees), or bought back from one. The rate fills in
 * from the desk rate and the rupee total is worked out as you type. A sale needs a passport number, and a PAN once it reaches
 * ₹50,000 — the form says so as soon as it does.
 */
export function NewDealDialog({ open, onClose, positions, preset }: { open: boolean; onClose: () => void; positions: ForexPosition[]; preset?: DealPreset }) {
  return (
    <Dialog open={open} onClose={onClose} title="New forex deal" description="Sell currency to a customer, or buy it back." size="lg">
      <DealForm positions={positions} preset={preset} onDone={onClose} />
    </Dialog>
  );
}

function DealForm({ positions, preset, onDone }: { positions: ForexPosition[]; preset?: DealPreset; onDone: () => void }) {
  const record = useRecordForexTransaction();
  const [formError, setFormError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const { data: customer } = useCustomer(customerId);
  const initialType = preset?.type ?? "SELL";
  const dealable = (type: ForexType) => positions.filter((p) => (type === "SELL" ? p.sellRate != null : p.buyRate != null));
  const firstCurrency = preset?.currency ?? dealable(initialType)[0]?.code ?? positions[0]?.code ?? "";

  const { register, handleSubmit, setError, setValue, watch, formState } = useForm<DealIn, unknown, DealOut>({
    resolver: zodResolver(forexTransactionInputSchema),
    defaultValues: { type: initialType, form: "CASH", paymentMethod: "CASH", currency: firstCurrency, rate: positions.find((p) => p.code === firstCurrency)?.[initialType === "SELL" ? "sellRate" : "buyRate"] ?? "" },
  });
  const type = (watch("type") ?? "SELL") as ForexType;
  const currencyCode = watch("currency");
  const foreignAmount = Number(watch("foreignAmount")) || 0;
  const rate = Number(watch("rate")) || 0;
  const position = positions.find((p) => p.code === currencyCode);
  const inr = foreignAmount > 0 && rate > 0 ? forexInr(foreignAmount, rate) : 0;
  const needsPan = type === "SELL" && inr >= FOREX_PAN_THRESHOLD;
  const deskRate = position ? (type === "SELL" ? position.sellRate : position.buyRate) : null;

  // The desk rate follows the currency and the direction, until the counter types their own.
  const pickRate = (code: string, t: ForexType) => {
    const p = positions.find((x) => x.code === code);
    setValue("rate", (t === "SELL" ? p?.sellRate : p?.buyRate) ?? "");
  };

  // Choosing an existing customer fills in their name and number; they can still be edited.
  useEffect(() => {
    if (customer) {
      setValue("customerName", customer.fullName);
      setValue("phone", customer.phone);
      setValue("customerId", customer.id);
    }
  }, [customer, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const deal = await record.mutateAsync(values);
      toast.success(`${deal.refNo} recorded — ${num(deal.foreignAmount)} ${deal.currency} ${deal.type === "SELL" ? "sold for" : "bought for"} ${formatINR(deal.inrAmount)}`);
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1" role="radiogroup" aria-label="Deal type">
        {(["SELL", "BUY"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => {
              setValue("type", t);
              pickRate(currencyCode, t);
            }}
            className={cn("rounded-lg px-3 py-2 text-sm font-semibold transition", type === t ? "bg-white text-plum-700 shadow-sm" : "text-ink-500 hover:text-ink-900")}
          >
            {t === "SELL" ? "Sell to customer" : "Buy from customer"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <CustomerPicker value={customerId} onChange={setCustomerId} label="Existing customer" hint="Optional — pick one to fill in the details below, or just type a walk-in's name." />
        </div>
        <TextField label="Customer name" required error={formState.errors.customerName?.message} {...register("customerName")} />
        <TextField label="Mobile" type="tel" error={formState.errors.phone?.message} {...register("phone")} />
      </div>

      <div className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-3">
        <SelectField
          label="Currency"
          required
          error={formState.errors.currency?.message}
          {...register("currency", {
            onChange: (e) => pickRate(e.target.value as string, type),
          })}
        >
          {positions.map((p) => (
            <option key={p.code} value={p.code} disabled={(type === "SELL" ? p.sellRate : p.buyRate) == null}>
              {p.code} — {p.name}
              {type === "SELL" ? ` (stock ${num(p.stock, 0)})` : ""}
            </option>
          ))}
        </SelectField>
        <TextField label={`Amount (${currencyCode || "…"})`} type="number" min={0} step="0.01" required autoFocus error={formState.errors.foreignAmount?.message} {...register("foreignAmount")} />
        <TextField
          label={`Rate (₹ per ${currencyCode || "1"})`}
          type="number"
          min={0}
          step="0.0001"
          hint={deskRate != null ? `Desk rate ₹${num(deskRate, 4)}` : "No desk rate set"}
          error={formState.errors.rate?.message}
          {...register("rate")}
        />
        <div className="rounded-lg border border-plum-200 bg-white px-4 py-3 sm:col-span-3">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{type === "SELL" ? "Customer pays" : "We pay the customer"}</p>
          <p className="text-2xl font-bold text-ink-900 tabular-nums">{formatINR(inr)}</p>
          {type === "SELL" && position && foreignAmount > position.stock && <p className="mt-1 text-sm font-semibold text-red-600">Only {num(position.stock)} {position.code} in stock.</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Form" {...register("form")}>
          {FOREX_FORMS.map((f) => (
            <option key={f} value={f}>
              {FOREX_FORM_LABELS[f]}
            </option>
          ))}
        </SelectField>
        <SelectField label={type === "SELL" ? "Customer pays by" : "We pay by"} {...register("paymentMethod")}>
          {FINANCE_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </SelectField>
        <TextField label="Reference" hint="UTR or card number, optional" error={formState.errors.reference?.message} {...register("reference")} />
        <TextField label="Passport number" required={type === "SELL"} error={formState.errors.passportNo?.message} {...register("passportNo")} />
        <TextField
          label="PAN"
          required={needsPan}
          placeholder="ABCDE1234F"
          maxLength={10}
          hint={needsPan ? `Needed for ₹${FOREX_PAN_THRESHOLD.toLocaleString("en-IN")} or more` : "Needed from ₹50,000"}
          error={formState.errors.panNo?.message}
          {...register("panNo")}
        />
        <TextField label="Purpose of travel" list="forex-purposes" error={formState.errors.purpose?.message} {...register("purpose")} />
        <datalist id="forex-purposes">
          {PURPOSES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <TextareaField label="Notes" hint="Optional" rows={2} {...register("notes")} />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          {type === "SELL" ? "Record sale" : "Record purchase from customer"}
        </Button>
      </div>
    </form>
  );
}

/** Foreign currency bought from a dealer, which becomes stock to sell. */
export function PurchaseDialog({ open, onClose, positions, currency }: { open: boolean; onClose: () => void; positions: ForexPosition[]; currency?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title="Buy stock from a dealer" description="This adds to your stock and goes out on the Accounts ledger.">
      <PurchaseForm positions={positions} currency={currency} onDone={onClose} />
    </Dialog>
  );
}

function PurchaseForm({ positions, currency, onDone }: { positions: ForexPosition[]; currency?: string; onDone: () => void }) {
  const record = useRecordForexPurchase();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, watch, formState } = useForm<PurchaseIn, unknown, PurchaseOut>({
    resolver: zodResolver(forexPurchaseInputSchema),
    defaultValues: { currency: currency ?? positions[0]?.code ?? "", purchaseDate: today(), paymentMethod: "BANK_TRANSFER" },
  });
  const code = watch("currency");
  const total = Number(watch("foreignAmount")) > 0 && Number(watch("rate")) > 0 ? forexInr(Number(watch("foreignAmount")), Number(watch("rate"))) : 0;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await record.mutateAsync(values);
      toast.success(`${num(values.foreignAmount)} ${values.currency} added to stock`);
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Currency" required error={formState.errors.currency?.message} {...register("currency")}>
          {positions.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} — {p.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Dealer" required placeholder="e.g. Thomas Cook" error={formState.errors.supplier?.message} {...register("supplier")} />
        <TextField label={`Amount (${code || "…"})`} type="number" min={0} step="0.01" required autoFocus error={formState.errors.foreignAmount?.message} {...register("foreignAmount")} />
        <TextField label={`Rate (₹ per ${code || "1"})`} type="number" min={0} step="0.0001" required error={formState.errors.rate?.message} {...register("rate")} />
        <TextField label="Date" type="date" required max={today()} error={formState.errors.purchaseDate?.message} {...register("purchaseDate")} />
        <SelectField label="Paid by" {...register("paymentMethod")}>
          {FINANCE_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </SelectField>
      </div>
      <p className="rounded-lg bg-surface px-3 py-2.5 text-sm text-ink-700">
        We pay the dealer <span className="font-semibold">{formatINR(total)}</span>
      </p>
      <TextField label="Reference" hint="Invoice or UTR, optional" error={formState.errors.reference?.message} {...register("reference")} />
      <TextareaField label="Notes" hint="Optional" rows={2} {...register("notes")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Add to stock
        </Button>
      </div>
    </form>
  );
}

/** Cancels a deal or a purchase. Nothing is deleted; the stock goes back to what it was. */
export function CancelDialog({ target, onClose }: { target: { kind: "deal" | "purchase"; id: string; label: string } | null; onClose: () => void }) {
  const cancelDeal = useCancelForexTransaction();
  const cancelPurchase = useCancelForexPurchase();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!target) return;
    setError(null);
    try {
      await (target.kind === "deal" ? cancelDeal : cancelPurchase).mutateAsync({ id: target.id, reason });
      toast.success(`${target.label} cancelled`);
      setReason("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open={Boolean(target)} onClose={onClose} title="Cancel this entry" description={target?.label}>
      <div className="space-y-4">
        <FormError message={error} />
        <p className="rounded-lg bg-surface p-3 text-sm text-ink-700">It stays on record marked cancelled, the stock goes back to what it was, and the money no longer counts on the ledger.</p>
        <TextareaField label="Why is it being cancelled?" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer changed their mind" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" onClick={submit} loading={cancelDeal.isPending || cancelPurchase.isPending} disabled={reason.trim().length < 3}>
            Cancel entry
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
