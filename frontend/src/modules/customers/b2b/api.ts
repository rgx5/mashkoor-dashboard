import type { CustomerDetail, CustomerInput, CustomerRow, Paginated } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const b2b = api("b2b");
const key = ["b2b", "customers"] as const;

export const useMyCustomers = (filters: { page: number; q?: string }) => useQuery({ queryKey: [...key, "list", filters], queryFn: () => b2b.get<Paginated<CustomerRow>>("/customers", { ...filters, pageSize: 25 }) });
export const useMyCustomer = (id: string) => useQuery({ queryKey: [...key, "detail", id], queryFn: () => b2b.get<CustomerDetail>(`/customers/${id}`), enabled: Boolean(id) });

export function useCreateMyCustomer() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CustomerInput) => b2b.post<CustomerDetail>("/customers", input), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
}
