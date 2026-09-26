import type { PriceQuoteInput, PriceQuoteResult, PricingRule, PricingRuleData, PricingRuleUpdateData } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");

export const usePricingRules = () => useQuery({ queryKey: ["admin", "pricing-rules"], queryFn: () => admin.get<PricingRule[]>("/pricing-rules") });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "pricing-rules"] }) });
}

export const useCreatePricingRule = () => useInvalidating((input: PricingRuleData) => admin.post<PricingRule>("/pricing-rules", input));
export const useUpdatePricingRule = () => useInvalidating(({ id, input }: { id: string; input: PricingRuleUpdateData }) => admin.patch<PricingRule>(`/pricing-rules/${id}`, input));
export const useDeletePricingRule = () => useInvalidating((id: string) => admin.delete<void>(`/pricing-rules/${id}`));
export const usePriceQuote = () => useMutation({ mutationFn: (input: PriceQuoteInput) => admin.post<PriceQuoteResult>("/pricing-rules/quote", input) });
