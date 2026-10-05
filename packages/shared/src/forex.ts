import { z } from "zod";
import { optionalText } from "./crm";
import { MANUAL_PAYMENT_METHODS, type PaymentMethod } from "./payments";

const uuid = z.uuid();

/**
 * The forex desk: Mashkoor sells foreign currency to customers (and buys it back), at its own buy and sell rates, with the
 * identity details the law asks for. Stock comes from purchases made from dealers.
 */

export const FOREX_TYPES = ["SELL", "BUY"] as const;
export type ForexType = (typeof FOREX_TYPES)[number];
export const FOREX_TYPE_LABELS: Record<ForexType, string> = { SELL: "Sold to customer", BUY: "Bought from customer" };

export const FOREX_FORMS = ["CASH", "CARD", "TRANSFER"] as const;
export type ForexForm = (typeof FOREX_FORMS)[number];
export const FOREX_FORM_LABELS: Record<ForexForm, string> = { CASH: "Cash notes", CARD: "Forex card", TRANSFER: "Wire transfer" };

/** A sale at or above this many rupees needs the customer's PAN. */
export const FOREX_PAN_THRESHOLD = 50_000;

/** The rupee value of an amount of foreign currency at a rate, to the whole rupee. */
export const forexInr = (foreignAmount: number, rate: number) => Math.round(foreignAmount * rate);

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Choose a currency");
const amount = z.coerce.number("Enter the amount").positive("Enter an amount greater than 0").max(10_000_000, "That amount is too large");
const today = () => new Date().toISOString().slice(0, 10);

export const forexTransactionInputSchema = z
  .object({
    type: z.enum(FOREX_TYPES).default("SELL"),
    form: z.enum(FOREX_FORMS).default("CASH"),
    customerId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .pipe(uuid.nullable()),
    customerName: z.string().trim().min(2, "Enter the customer's name").max(120),
    phone: optionalText(20),
    currency: code,
    foreignAmount: amount,
    /** Leave out to use the desk rate; a different rate is the counter's call and is recorded as typed. */
    rate: z
      .union([z.literal(""), z.null(), z.undefined(), z.coerce.number().positive("Enter a rate greater than 0")])
      .transform((v) => (v === "" || v == null ? null : v)),
    paymentMethod: z.enum(MANUAL_PAYMENT_METHODS, "Choose how the customer paid"),
    passportNo: optionalText(20),
    panNo: optionalText(10).transform((v) => (v ? v.toUpperCase() : v)),
    purpose: optionalText(120),
    reference: optionalText(120),
    notes: optionalText(1000),
  })
  .refine((v) => v.type !== "SELL" || Boolean(v.passportNo), { path: ["passportNo"], message: "A passport number is needed for a sale" })
  .refine((v) => !v.panNo || /^[A-Z]{5}\d{4}[A-Z]$/.test(v.panNo), { path: ["panNo"], message: "Enter a valid PAN, e.g. ABCDE1234F" });
export type ForexTransactionInput = z.input<typeof forexTransactionInputSchema>;
export type ForexTransactionData = z.output<typeof forexTransactionInputSchema>;

export const forexPurchaseInputSchema = z.object({
  currency: code,
  foreignAmount: amount,
  rate: z.coerce.number("Enter the rate").positive("Enter a rate greater than 0"),
  supplier: z.string().trim().min(2, "Enter the dealer's name").max(120),
  paymentMethod: z.enum(MANUAL_PAYMENT_METHODS, "Choose how it was paid"),
  purchaseDate: z.iso.date("Enter a valid date").refine((d) => d <= today(), "The date can't be in the future"),
  reference: optionalText(120),
  notes: optionalText(1000),
});
export type ForexPurchaseInput = z.input<typeof forexPurchaseInputSchema>;
export type ForexPurchaseData = z.output<typeof forexPurchaseInputSchema>;

export const forexCancelSchema = z.object({ reason: z.string().trim().min(3, "Say why this is being cancelled").max(300) });
export type ForexCancelData = z.output<typeof forexCancelSchema>;

/** The desk's buy and sell rates for several currencies at once. A null rate switches the currency off at the counter. */
export const forexRatesUpdateSchema = z.object({
  rates: z
    .array(
      z
        .object({
          code,
          buyRate: z.coerce.number().positive("Enter a rate greater than 0").nullable(),
          sellRate: z.coerce.number().positive("Enter a rate greater than 0").nullable(),
        })
        .refine((r) => r.buyRate === null || r.sellRate === null || r.sellRate >= r.buyRate, { path: ["sellRate"], message: "The sell rate can't be lower than the buy rate" }),
    )
    .min(1, "Nothing to update")
    .max(100),
});
export type ForexRatesUpdateData = z.output<typeof forexRatesUpdateSchema>;

const optionalDate = z
  .string()
  .optional()
  .transform((v) => v || undefined)
  .pipe(z.iso.date().optional());

export const forexTransactionListQuerySchema = z.object({
  from: optionalDate,
  to: optionalDate,
  type: z.enum(FOREX_TYPES).optional(),
  currency: code.optional(),
  status: z.enum(["active", "cancelled", "all"]).default("active"),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ForexTransactionListQuery = z.output<typeof forexTransactionListQuerySchema>;

export const forexPurchaseListQuerySchema = z.object({
  currency: code.optional(),
  status: z.enum(["active", "cancelled", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ForexPurchaseListQuery = z.output<typeof forexPurchaseListQuerySchema>;

export interface ForexTransactionRow {
  id: string;
  refNo: string;
  type: ForexType;
  form: ForexForm;
  customer: { id: string; refNo: string } | null;
  customerName: string;
  phone: string | null;
  currency: string;
  foreignAmount: number;
  rate: number;
  inrAmount: number;
  paymentMethod: PaymentMethod;
  passportNo: string | null;
  panNo: string | null;
  purpose: string | null;
  reference: string | null;
  notes: string | null;
  /** What the sale earned over the desk's average cost at the time. Null for a buy-back, which only earns when it is resold. */
  margin: number | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ForexPurchaseRow {
  id: string;
  currency: string;
  foreignAmount: number;
  rate: number;
  inrAmount: number;
  supplier: string;
  paymentMethod: PaymentMethod;
  purchaseDate: string;
  reference: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** One currency at the counter: what is in stock, what it cost, and what it sells for. */
export interface ForexPosition {
  code: string;
  name: string;
  symbol: string;
  /** Units of the currency in stock: purchases and buy-backs, less sales. */
  stock: number;
  /** Average rupee cost per unit of everything bought so far. Null before the first purchase. */
  avgCost: number | null;
  buyRate: number | null;
  sellRate: number | null;
  /** Sell rate less average cost, per unit. */
  marginPerUnit: number | null;
  stockValue: number;
  /** Whether it can be sold at the counter (has a sell rate and is switched on). */
  offered: boolean;
}

export interface ForexOverview {
  positions: ForexPosition[];
  today: { sales: number; count: number };
  month: { sales: number; margin: number; count: number };
  stockValue: number;
}
