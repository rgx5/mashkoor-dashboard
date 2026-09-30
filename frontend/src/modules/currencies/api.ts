import type { CurrencyData, CurrencyRow, CurrencyUpdateData } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");
const key = ["admin", "currencies"] as const;

/** Every currency, INR included — used both by the admin page and the itinerary editor's per-line currency picker. */
export const useCurrencies = () => useQuery({ queryKey: key, queryFn: () => admin.get<CurrencyRow[]>("/currencies") });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: key }) });
}

export const useCreateCurrency = () => useInvalidating((input: CurrencyData) => admin.post<CurrencyRow>("/currencies", input));
export const useUpdateCurrency = () => useInvalidating(({ code, input }: { code: string; input: CurrencyUpdateData }) => admin.patch<CurrencyRow>(`/currencies/${code}`, input));
export const useDeleteCurrency = () => useInvalidating((code: string) => admin.delete<void>(`/currencies/${code}`));
