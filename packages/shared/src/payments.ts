import { z } from "zod";
import { listQuerySchema } from "./pagination";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CARD", "GATEWAY", "OTHER"] as const;
/** Methods staff can record by hand — online payments are only ever created by the gateway webhook. */
export const MANUAL_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CARD", "OTHER"] as const satisfies readonly PaymentMethod[];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CARD: "Card",
  GATEWAY: "Online",
  OTHER: "Other",
};

export const PAYMENT_DIRECTIONS = ["COLLECTION", "REFUND"] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];

export const PAYMENT_STATUSES = ["PENDING", "VERIFIED", "REJECTED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = { PENDING: "Pending verification", VERIFIED: "Verified", REJECTED: "Rejected" };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const paymentInputSchema = z.object({
  bookingId: z.uuid(),
  direction: z.enum(PAYMENT_DIRECTIONS).default("COLLECTION"),
  method: z.enum(PAYMENT_METHODS),
  amount: z.coerce.number().int().min(1, "Enter an amount"),
  reference: optionalText(120),
  notes: optionalText(1000),
});
export type PaymentInput = z.input<typeof paymentInputSchema>;
export type PaymentData = z.output<typeof paymentInputSchema>;

export const paymentRejectSchema = z.object({ reason: z.string().trim().min(2, "Say why this payment is being rejected").max(1000) });

export const paymentListQuerySchema = listQuerySchema.extend({ bookingId: z.uuid().optional(), customerId: z.uuid().optional(), status: z.enum(PAYMENT_STATUSES).optional() });
export type PaymentListQuery = z.output<typeof paymentListQuerySchema>;

export interface PaymentRow {
  id: string;
  receiptNo: string;
  bookingId: string;
  booking: { id: string; refNo: string; customer: { id: string; fullName: string } } | null;
  direction: PaymentDirection;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  gatewayRef: string | null;
  status: PaymentStatus;
  notes: string | null;
  recordedBy: { id: string; name: string } | null;
  verifiedBy: { id: string; name: string } | null;
  verifiedAt: string | null;
  createdAt: string;
}

/** A booking's balance, computed from its sell price and its verified payments. */
export interface BookingPaymentSummary {
  totalSell: number;
  totalCollected: number;
  totalRefunded: number;
  balanceDue: number;
  payments: PaymentRow[];
}

// ─── Payment links & the gateway ────────────────────────────────────────────

export const PAYMENT_LINK_STATUSES = ["ACTIVE", "PAID", "EXPIRED", "CANCELLED"] as const;
export type PaymentLinkStatus = (typeof PAYMENT_LINK_STATUSES)[number];

export const paymentLinkInputSchema = z.object({
  bookingId: z.uuid(),
  /** Defaults to the booking's full balance due. */
  amount: z.coerce.number().int().min(1).optional(),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 30).default(72),
  note: optionalText(300),
});
export type PaymentLinkInput = z.input<typeof paymentLinkInputSchema>;
export type PaymentLinkData = z.output<typeof paymentLinkInputSchema>;

export interface PaymentLinkRow {
  id: string;
  bookingId: string;
  amount: number;
  status: PaymentLinkStatus;
  /** Full shareable URL, e.g. https://app.example.com/pay/abc123. */
  url: string;
  note: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
}

/** What the customer sees at `/pay/:token`. */
export interface PublicPaymentLink {
  status: PaymentLinkStatus;
  amount: number;
  currency: string;
  bookingRef: string;
  customerName: string;
  description: string;
  expiresAt: string;
  receiptNo: string | null;
  /** "mock" shows the test checkout; a real gateway would hand off to its hosted page. */
  gateway: "mock";
  company: { name: string; phone: string | null };
}

export const MOCK_CHECKOUT_METHODS = ["UPI", "CARD", "NETBANKING"] as const;
export const mockCheckoutSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  method: z.enum(MOCK_CHECKOUT_METHODS).default("UPI"),
  outcome: z.enum(["SUCCESS", "FAILURE"]).default("SUCCESS"),
});
export type MockCheckoutInput = z.output<typeof mockCheckoutSchema>;

export interface CheckoutOrder {
  orderId: string;
  amount: number;
  gateway: "mock";
}
