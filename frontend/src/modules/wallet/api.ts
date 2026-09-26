import { WALLET_CREDIT_TYPES, WALLET_ENTRY_TYPE_LABELS, type Paginated, type WalletAdjustInput, type WalletLedgerRow, type WalletSummary, type WalletTopUpInput } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";
import { downloadCsv } from "@/modules/administration/csv";

function walletApi(portal: "admin" | "b2b", partnerId?: string) {
  const client = api(portal);
  const base = portal === "admin" ? `/partners/${partnerId}/wallet` : "/wallet";
  return {
    summary: () => client.get<WalletSummary>(base),
    ledger: (page: number, pageSize = 25) => client.get<Paginated<WalletLedgerRow>>(`${base}/ledger`, { page, pageSize }),
  };
}

export const useWalletSummary = (portal: "admin" | "b2b", partnerId?: string) =>
  useQuery({ queryKey: ["wallet", portal, partnerId, "summary"], queryFn: () => walletApi(portal, partnerId).summary(), enabled: portal === "b2b" || Boolean(partnerId) });

export const useWalletLedger = (portal: "admin" | "b2b", page: number, partnerId?: string) =>
  useQuery({ queryKey: ["wallet", portal, partnerId, "ledger", page], queryFn: () => walletApi(portal, partnerId).ledger(page), enabled: portal === "b2b" || Boolean(partnerId) });

/** Downloads the whole statement (every page) as a CSV that opens cleanly in Excel. */
export async function exportWalletStatement(portal: "admin" | "b2b", partnerId?: string) {
  const { ledger } = walletApi(portal, partnerId);
  const rows: string[][] = [["Date", "Type", "Direction", "Amount (INR)", "Balance after (INR)", "Note", "Reference"]];
  for (let page = 1; page <= 100; page++) {
    const chunk = await ledger(page, 100);
    for (const e of chunk.data) {
      rows.push([e.createdAt.slice(0, 10), WALLET_ENTRY_TYPE_LABELS[e.type], WALLET_CREDIT_TYPES.has(e.type) ? "Credit" : "Debit", String(e.amount), String(e.balanceAfter), e.note ?? "", e.referenceId ?? ""]);
    }
    if (page * chunk.meta.pageSize >= chunk.meta.total) break;
  }
  downloadCsv(`wallet-statement-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  return rows.length - 1;
}

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["wallet"] }) });
}

export const useTopUpWallet = () => useInvalidating(({ partnerId, input }: { partnerId: string; input: WalletTopUpInput }) => api("admin").post<WalletSummary>(`/partners/${partnerId}/wallet/topup`, input));
export const useAdjustWallet = () => useInvalidating(({ partnerId, input }: { partnerId: string; input: WalletAdjustInput }) => api("admin").post<WalletSummary>(`/partners/${partnerId}/wallet/adjust`, input));
export const useSetCreditLimit = () => useInvalidating(({ partnerId, creditLimit }: { partnerId: string; creditLimit: number }) => api("admin").post<WalletSummary>(`/partners/${partnerId}/wallet/credit-limit`, { creditLimit }));
