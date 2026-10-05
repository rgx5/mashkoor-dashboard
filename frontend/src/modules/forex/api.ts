import type {
  ForexOverview,
  ForexPurchaseInput,
  ForexPurchaseListQuery,
  ForexPurchaseRow,
  ForexRatesUpdateData,
  ForexTransactionInput,
  ForexTransactionListQuery,
  ForexTransactionRow,
  Paginated,
} from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");
const key = ["admin", "forex"] as const;

export const useForexOverview = () => useQuery({ queryKey: [...key, "overview"], queryFn: () => admin.get<ForexOverview>("/forex/overview") });
export const useForexTransactions = (query: Partial<ForexTransactionListQuery>) => useQuery({ queryKey: [...key, "transactions", query], queryFn: () => admin.get<Paginated<ForexTransactionRow>>("/forex/transactions", { ...query }) });
export const useForexPurchases = (query: Partial<ForexPurchaseListQuery>) => useQuery({ queryKey: [...key, "purchases", query], queryFn: () => admin.get<Paginated<ForexPurchaseRow>>("/forex/purchases", { ...query }) });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  // Money moved: the Accounts screens read the same records.
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: key }), client.invalidateQueries({ queryKey: ["admin", "finance"] })]) });
}

export const useUpdateForexRates = () => useInvalidating((input: ForexRatesUpdateData) => admin.put<{ changed: number }>("/forex/rates", input));
export const useRecordForexTransaction = () => useInvalidating((input: ForexTransactionInput) => admin.post<ForexTransactionRow>("/forex/transactions", input));
export const useCancelForexTransaction = () => useInvalidating(({ id, reason }: { id: string; reason: string }) => admin.post<ForexTransactionRow>(`/forex/transactions/${id}/cancel`, { reason }));
export const useRecordForexPurchase = () => useInvalidating((input: ForexPurchaseInput) => admin.post<ForexPurchaseRow>("/forex/purchases", input));
export const useCancelForexPurchase = () => useInvalidating(({ id, reason }: { id: string; reason: string }) => admin.post<ForexPurchaseRow>(`/forex/purchases/${id}/cancel`, { reason }));
