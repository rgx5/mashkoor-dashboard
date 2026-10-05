import { z } from "zod";
import { listQuerySchema } from "./pagination";
import { optionalText } from "./crm";
import { PRODUCT_TYPES, type ProductType } from "./constants";
import { itineraryLineSchema, type ItineraryLine } from "./itineraries";
import type { PaymentDirection, PaymentMethod, PaymentStatus } from "./payments";

const uuid = z.uuid();

export const INVOICE_STATUSES = ["ISSUED", "CANCELLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** What the customer still owes, worked out from the payments recorded against the invoice. */
export const INVOICE_PAYMENT_STATES = ["UNPAID", "PARTIAL", "PAID", "CANCELLED"] as const;
export type InvoicePaymentState = (typeof INVOICE_PAYMENT_STATES)[number];

export const INVOICE_PAYMENT_STATE_LABELS: Record<InvoicePaymentState, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Part paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

const dateOnly = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.iso.date("Enter a valid date").nullable());

const optionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(uuid.nullable());

const invoiceFields = z.object({
  /** What the invoice is for, printed under the customer's name. */
  subject: optionalText(200),
  issueDate: dateOnly,
  dueDate: dateOnly,
  /** The same priced lines a quotation has: type, details, quantity, price, currency, discount and tax. */
  lines: z.array(itineraryLineSchema).max(60, "An invoice can have up to 60 lines"),
  /** Added to (or, negative, taken off) the total of the lines. */
  adjustment: z.coerce.number().int().default(0),
  notes: optionalText(2000),
  terms: optionalText(6000),
});

/**
 * An invoice is written like a quotation: a customer, priced lines, an adjustment, notes and terms. It can be raised against
 * an existing booking, or from scratch (just a customer) — in which case a booking is created behind it to carry the payments.
 * `lines` may be left out when invoicing a booking, and are then copied from it.
 */
export const invoiceInputSchema = invoiceFields
  .partial({ lines: true, issueDate: true })
  .extend({
    bookingId: optionalId,
    customerId: optionalId,
    /** The quotation the lines came from, kept for reference. */
    itineraryId: optionalId,
    /** Needed to price from inventory and to label the booking created behind a stand-alone invoice. */
    productType: z.enum(PRODUCT_TYPES).default("HOLIDAY"),
  })
  .refine((v) => Boolean(v.bookingId || v.customerId), { path: ["customerId"], message: "Choose the customer to invoice" })
  .refine((v) => Boolean(v.bookingId) || (v.lines?.length ?? 0) > 0, { path: ["lines"], message: "Add at least one line" });
export type InvoiceInput = z.input<typeof invoiceInputSchema>;
export type InvoiceData = z.output<typeof invoiceInputSchema>;

/** Editing an invoice: everything except who it is for. With payments recorded, only the wording and dates can change. */
export const invoiceUpdateSchema = invoiceFields.partial();
export type InvoiceUpdateInput = z.input<typeof invoiceUpdateSchema>;
export type InvoiceUpdateData = z.output<typeof invoiceUpdateSchema>;

/** What the invoice editor starts from when it is opened for a booking or a quotation. */
export interface InvoicePrefill {
  bookingId: string | null;
  itineraryId: string | null;
  customer: { id: string; refNo: string; fullName: string };
  productType: ProductType;
  subject: string | null;
  lines: ItineraryLine[];
  adjustment: number;
  notes: string | null;
  terms: string | null;
}

export const invoiceListQuerySchema = listQuerySchema.extend({
  state: z.enum(INVOICE_PAYMENT_STATES).optional(),
  customerId: uuid.optional(),
  bookingId: uuid.optional(),
});
export type InvoiceListQuery = z.output<typeof invoiceListQuerySchema>;

/** An invoice line is a quotation line. (Invoices raised before the builder existed only have description, quantity and unit price; they are filled out when read.) */
export type InvoiceLine = ItineraryLine;

export interface InvoiceRow {
  id: string;
  refNo: string;
  state: InvoicePaymentState;
  booking: { id: string; refNo: string };
  customer: { id: string; refNo: string; fullName: string };
  issueDate: string;
  dueDate: string | null;
  total: number;
  paid: number;
  balance: number;
  sentAt: string | null;
  createdAt: string;
}

/** One payment entry on an invoice. */
export interface InvoicePaymentEntry {
  id: string;
  receiptNo: string;
  direction: PaymentDirection;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  reference: string | null;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceRow {
  lines: InvoiceLine[];
  adjustment: number;
  subject: string | null;
  notes: string | null;
  terms: string | null;
  itineraryId: string | null;
  /** Written from scratch: a booking was created to carry its payments, and editing keeps it in step. */
  ownsBooking: boolean;
  productType: ProductType;
  /** Some payment is recorded against it, so the lines can no longer change. */
  linesLocked: boolean;
  lead: { id: string; refNo: string } | null;
  customerEmail: string | null;
  payments: InvoicePaymentEntry[];
}
