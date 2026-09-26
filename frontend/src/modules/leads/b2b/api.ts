import type { LeadDetail, LeadInput, LeadRow, Paginated } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const b2b = api("b2b");
const key = ["b2b", "leads"] as const;

export const useMyEnquiries = (filters: { page: number; q?: string }) => useQuery({ queryKey: [...key, "list", filters], queryFn: () => b2b.get<Paginated<LeadRow>>("/leads", { ...filters, pageSize: 25 }) });

export function useCreateMyEnquiry() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: LeadInput) => b2b.post<LeadDetail>("/leads", input), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
}
