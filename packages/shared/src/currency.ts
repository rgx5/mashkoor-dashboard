import { z } from "zod";
import { patchOf } from "./patch";

/** INR is the base currency: always present, always rate 1, and it's the currency every total is shown in. */
export const BASE_CURRENCY = "INR";

const currencyFields = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO code, e.g. SAR"),
  name: z.string().trim().min(2, "Enter the currency's name").max(80),
  symbol: z.string().trim().min(1, "Enter a symbol, e.g. ﷼").max(6),
  /** How many INR equal 1 unit of this currency. */
  rateToInr: z.coerce.number().positive("Enter a rate greater than 0"),
  active: z.boolean().default(true),
});

export const currencyInputSchema = currencyFields;
export type CurrencyInput = z.input<typeof currencyInputSchema>;
export type CurrencyData = z.output<typeof currencyInputSchema>;

// A PATCH allows any subset of fields except `code`, which is the row's identity — renaming a currency is deleting
// one and adding another, not an update.
export const currencyUpdateSchema = patchOf(currencyFields.omit({ code: true }));
export type CurrencyUpdateData = z.output<typeof currencyUpdateSchema>;

/** Today's rates for several currencies at once — the daily "update the forex rates" job. */
export const currencyRatesUpdateSchema = z.object({
  rates: z
    .array(z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), rateToInr: z.coerce.number().positive("Enter a rate greater than 0") }))
    .min(1, "Nothing to update")
    .max(100),
});
export type CurrencyRatesUpdateData = z.output<typeof currencyRatesUpdateSchema>;

export interface CurrencyRow {
  code: string;
  name: string;
  symbol: string;
  rateToInr: number;
  /** The rate before the latest change, for showing which way it moved. Null if it has never changed. */
  previousRate: number | null;
  active: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

/** One entry in a currency's rate history. */
export interface CurrencyRateLogRow {
  id: string;
  rate: number;
  previousRate: number | null;
  changedBy: string | null;
  createdAt: string;
}
