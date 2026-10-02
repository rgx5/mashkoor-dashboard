import { z } from "zod";
import { optionalText } from "./crm";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHODS, type PaymentMethod } from "./payments";

const uuid = z.uuid();

export const FINANCE_DIRECTIONS = ["IN", "OUT"] as const;
export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number];

/** What a manually recorded entry was for. Each category is always one direction, so the form never has to ask. */
export const FINANCE_CATEGORIES = ["SUPPLIER_PAYMENT", "SUPPLIER_REFUND", "SALARY", "RENT_UTILITIES", "MARKETING", "OFFICE", "TRAVEL", "TAXES_FEES", "OTHER_EXPENSE", "OTHER_INCOME"] as const;
export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export const FINANCE_CATEGORY_LABELS: Record<FinanceCategory, string> = {
  SUPPLIER_PAYMENT: "Supplier payment",
  SUPPLIER_REFUND: "Supplier refund",
  SALARY: "Salaries",
  RENT_UTILITIES: "Rent & utilities",
  MARKETING: "Marketing",
  OFFICE: "Office expenses",
  TRAVEL: "Travel & conveyance",
  TAXES_FEES: "Taxes & fees",
  OTHER_EXPENSE: "Other expense",
  OTHER_INCOME: "Other income",
};

export const FINANCE_CATEGORY_DIRECTION: Record<FinanceCategory, FinanceDirection> = {
  SUPPLIER_PAYMENT: "OUT",
  SUPPLIER_REFUND: "IN",
  SALARY: "OUT",
  RENT_UTILITIES: "OUT",
  MARKETING: "OUT",
  OFFICE: "OUT",
  TRAVEL: "OUT",
  TAXES_FEES: "OUT",
  OTHER_EXPENSE: "OUT",
  OTHER_INCOME: "IN",
};

/** Categories that are about a particular booking, so the form offers the booking picker for them. */
export const FINANCE_BOOKING_CATEGORIES: readonly FinanceCategory[] = ["SUPPLIER_PAYMENT", "SUPPLIER_REFUND"];

/** Everything that can appear on the ledger: money from the booking flow plus the manual categories. */
export const LEDGER_KINDS = ["CUSTOMER_PAYMENT", "CUSTOMER_REFUND", "WALLET_TOPUP", ...FINANCE_CATEGORIES] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  CUSTOMER_PAYMENT: "Customer payment",
  CUSTOMER_REFUND: "Customer refund",
  WALLET_TOPUP: "Partner wallet top-up",
  ...FINANCE_CATEGORY_LABELS,
};

export const LEDGER_KIND_DIRECTION: Record<LedgerKind, FinanceDirection> = {
  CUSTOMER_PAYMENT: "IN",
  CUSTOMER_REFUND: "OUT",
  WALLET_TOPUP: "IN",
  ...FINANCE_CATEGORY_DIRECTION,
};

/** Cash, bank transfer, UPI, card or other. (Gateway money is recorded by the system, never typed in.) */
export const FINANCE_METHODS = MANUAL_PAYMENT_METHODS;

const today = () => new Date().toISOString().slice(0, 10);

const requiredDate = z.iso.date("Enter a valid date").refine((d) => d <= today(), "The date can't be in the future");

export const financeEntryInputSchema = z
  .object({
    category: z.enum(FINANCE_CATEGORIES, "Choose what this was for"),
    amount: z.coerce.number("Enter the amount").int("Enter whole rupees").min(1, "Enter the amount").max(100_000_000),
    entryDate: requiredDate,
    method: z.enum(MANUAL_PAYMENT_METHODS, "Choose how it was paid"),
    party: optionalText(120),
    bookingId: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .pipe(uuid.nullable()),
    reference: optionalText(120),
    notes: optionalText(1000),
  })
  .refine((v) => v.category !== "SUPPLIER_PAYMENT" || Boolean(v.party), { path: ["party"], message: "Enter the supplier's name" });
export type FinanceEntryInput = z.input<typeof financeEntryInputSchema>;
export type FinanceEntryData = z.output<typeof financeEntryInputSchema>;

export const financeReverseSchema = z.object({ reason: z.string().trim().min(3, "Say why this is being cancelled").max(300) });
export type FinanceReverseData = z.output<typeof financeReverseSchema>;

const optionalDate = z
  .string()
  .optional()
  .transform((v) => v || undefined)
  .pipe(z.iso.date().optional());

export const ledgerQuerySchema = z.object({
  from: optionalDate,
  to: optionalDate,
  direction: z.enum(FINANCE_DIRECTIONS).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  kind: z.enum(LEDGER_KINDS).optional(),
  bookingId: uuid.optional(),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || undefined),
  page: z.coerce.number().int().min(1).default(1),
  /** The screen uses 50; "Export CSV" asks for the whole range at once. */
  pageSize: z.coerce.number().int().min(1).max(5000).default(50),
});
export type LedgerQuery = z.output<typeof ledgerQuerySchema>;

export const financeRangeSchema = z.object({ from: optionalDate, to: optionalDate });
export type FinanceRange = z.output<typeof financeRangeSchema>;

export const financeBookingsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || undefined),
  /** `owing`: customer still owes us · `supplier-due`: we still owe a supplier. */
  show: z.enum(["all", "owing", "supplier-due"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type FinanceBookingsQuery = z.output<typeof financeBookingsQuerySchema>;

export interface LedgerRow {
  /** `PAYMENT:<id>`, `WALLET:<id>` or `MANUAL:<id>` — unique across the three sources. */
  key: string;
  source: "PAYMENT" | "WALLET" | "MANUAL";
  sourceId: string;
  /** Receipt number or finance entry number; none for wallet top-ups. */
  entryNo: string | null;
  /** The day the money moved, `YYYY-MM-DD`. */
  date: string;
  at: string;
  direction: FinanceDirection;
  amount: number;
  /** Null for wallet top-ups, where the way it was paid isn't recorded. */
  method: PaymentMethod | null;
  kind: LedgerKind;
  /** The customer, agency, supplier or payee. */
  party: string | null;
  description: string;
  reference: string | null;
  booking: { id: string; refNo: string } | null;
  invoice: { id: string; refNo: string } | null;
  partner: { id: string; refNo: string } | null;
  recordedBy: string | null;
  hasReceipt: boolean;
  /** A manual entry that has been cancelled by a reversal. */
  reversed: boolean;
  /** A manual entry that is itself a cancellation, and the entry it cancels. */
  reversalOf: string | null;
  notes: string | null;
}

export interface LedgerTotals {
  in: number;
  out: number;
  net: number;
  count: number;
}

export interface LedgerPage {
  rows: LedgerRow[];
  totals: LedgerTotals;
  meta: { page: number; pageSize: number; total: number };
}

export interface MethodTotals {
  /** `OTHER` also holds partner wallet top-ups, whose payment method isn't recorded. */
  method: PaymentMethod;
  in: number;
  out: number;
  net: number;
}

export interface FinanceOverview {
  period: { from: string; to: string };
  totals: LedgerTotals;
  byMethod: MethodTotals[];
  /** Net money per method from the first entry up to the end of the period — what each till or account should hold. */
  balances: MethodTotals[];
  inByKind: { kind: LedgerKind; amount: number }[];
  outByKind: { kind: LedgerKind; amount: number }[];
  daily: { date: string; in: number; out: number }[];
  /** Customer payments entered but not yet verified; they are not counted anywhere above. */
  awaitingVerification: { count: number; amount: number };
  /** Customers owe us this much across live bookings. */
  receivables: { amount: number; bookings: number };
  /** We still owe suppliers this much: booking costs not yet matched by supplier payments. */
  payables: { amount: number; bookings: number };
}

export interface FinanceBookingRow {
  id: string;
  refNo: string;
  customer: { id: string; fullName: string };
  status: string;
  travelFrom: string | null;
  sell: number;
  collected: number;
  /** Still to collect from the customer. */
  receivable: number;
  cost: number;
  supplierPaid: number;
  /** Still to pay suppliers. */
  supplierDue: number;
  /** Cash margin so far: collected minus supplier payments. */
  cashMargin: number;
  /** Margin once everything is collected and paid: sell minus cost. */
  expectedMargin: number;
}

export interface FinanceBookingsPage {
  rows: FinanceBookingRow[];
  totals: { sell: number; collected: number; receivable: number; cost: number; supplierPaid: number; supplierDue: number; cashMargin: number; expectedMargin: number };
  meta: { page: number; pageSize: number; total: number };
}

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
