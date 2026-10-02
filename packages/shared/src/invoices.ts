import { z } from "zod";
import { listQuerySchema } from "./pagination";
import { optionalText } from "./crm";
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

/** An invoice is raised from a booking: its lines and total are copied from the (accepted) quotation behind it. */
export const invoiceInputSchema = z.object({
  bookingId: uuid,
  dueDate: dateOnly,
  notes: optionalText(2000),
});
export type InvoiceInput = z.input<typeof invoiceInputSchema>;
export type InvoiceData = z.output<typeof invoiceInputSchema>;

export const invoiceListQuerySchema = listQuerySchema.extend({
  state: z.enum(INVOICE_PAYMENT_STATES).optional(),
  customerId: uuid.optional(),
  bookingId: uuid.optional(),
});
export type InvoiceListQuery = z.output<typeof invoiceListQuerySchema>;

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

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
  notes: string | null;
  lead: { id: string; refNo: string } | null;
  customerEmail: string | null;
  payments: InvoicePaymentEntry[];
}
