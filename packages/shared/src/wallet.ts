import { z } from "zod";

export const WALLET_ENTRY_TYPES = ["TOPUP", "DEBIT", "REFUND", "ADJUSTMENT_CREDIT", "ADJUSTMENT_DEBIT"] as const;
export type WalletEntryType = (typeof WALLET_ENTRY_TYPES)[number];
export const WALLET_ENTRY_TYPE_LABELS: Record<WalletEntryType, string> = {
  TOPUP: "Top-up",
  DEBIT: "Debit",
  REFUND: "Refund",
  ADJUSTMENT_CREDIT: "Adjustment (credit)",
  ADJUSTMENT_DEBIT: "Adjustment (debit)",
};
/** Entries that increase the balance; the rest decrease it. */
export const WALLET_CREDIT_TYPES = new Set<WalletEntryType>(["TOPUP", "REFUND", "ADJUSTMENT_CREDIT"]);

const money = z.coerce.number().int().min(1);

export const walletTopUpSchema = z.object({ amount: money, note: z.string().trim().min(2, "Say how this top-up was received").max(500) });
export type WalletTopUpInput = z.output<typeof walletTopUpSchema>;

export const walletAdjustSchema = z.object({ direction: z.enum(["CREDIT", "DEBIT"]), amount: money, note: z.string().trim().min(2, "Say why this adjustment is being made").max(500) });
export type WalletAdjustInput = z.output<typeof walletAdjustSchema>;

export const walletCreditLimitSchema = z.object({ creditLimit: z.coerce.number().int().min(0) });
export type WalletCreditLimitInput = z.output<typeof walletCreditLimitSchema>;

export interface WalletSummary {
  partnerId: string;
  balance: number;
  creditLimit: number;
  /** balance + creditLimit — the most this partner can spend right now. */
  available: number;
}

export interface WalletLedgerRow {
  id: string;
  type: WalletEntryType;
  amount: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}

export const walletLedgerQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export type WalletLedgerQuery = z.output<typeof walletLedgerQuerySchema>;
