import type { CustomerDetail, CustomerDocumentRow, CustomerInput, CustomerRow, CustomerType, Paginated, PortalAccessInfo, Traveler, TravelerInput } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");

export interface CustomerFilters {
  page: number;
  q?: string;
  type?: CustomerType | "";
}

export interface DuplicateMatch {
  id: string;
  refNo: string;
  fullName: string;
  phone: string;
  email: string | null;
  matchedOn: "phone" | "email";
}

export const customerKeys = {
  all: ["admin", "customers"] as const,
  detail: (id: string) => ["admin", "customers", id] as const,
};

export const useCustomers = (filters: CustomerFilters, enabled = true) =>
  useQuery({
    enabled,
    queryKey: [...customerKeys.all, "list", filters],
    queryFn: () => admin.get<Paginated<CustomerRow>>("/customers", { ...filters, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

export const useCustomer = (id: string) => useQuery({ queryKey: customerKeys.detail(id), queryFn: () => admin.get<CustomerDetail>(`/customers/${id}`), enabled: Boolean(id) });

export const lookupCustomers = (params: { phone?: string; email?: string; excludeId?: string }) => admin.get<DuplicateMatch[]>("/customers/lookup", params);

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }) });
}

export const useCreateCustomer = () =>
  useInvalidating(({ input, allowDuplicate }: { input: CustomerInput; allowDuplicate?: boolean }) =>
    admin.post<CustomerDetail>(`/customers${allowDuplicate ? "?allowDuplicate=true" : ""}`, input),
  );

export const useUpdateCustomer = () => useInvalidating(({ id, input }: { id: string; input: Partial<CustomerInput> }) => admin.patch<CustomerDetail>(`/customers/${id}`, input));

export const useMergeCustomer = () => useInvalidating(({ id, duplicateId }: { id: string; duplicateId: string }) => admin.post<CustomerDetail>(`/customers/${id}/merge`, { duplicateId }));

export const useSaveTraveler = () =>
  useInvalidating(({ customerId, travelerId, input }: { customerId: string; travelerId?: string; input: TravelerInput }) =>
    travelerId ? admin.put<Traveler>(`/customers/${customerId}/travelers/${travelerId}`, input) : admin.post<Traveler>(`/customers/${customerId}/travelers`, input),
  );

export const useDeleteTraveler = () => useInvalidating(({ customerId, travelerId }: { customerId: string; travelerId: string }) => admin.delete<void>(`/customers/${customerId}/travelers/${travelerId}`));

export const revealPassport = (customerId: string, travelerId: string) => admin.post<{ passportNo: string | null }>(`/customers/${customerId}/travelers/${travelerId}/reveal-passport`);

export const usePortalAccess = (customerId: string) => useQuery({ queryKey: ["admin", "customers", customerId, "portal-access"], queryFn: () => admin.get<PortalAccessInfo>(`/customers/${customerId}/portal-access`), enabled: Boolean(customerId) });
/** Every document across every booking this customer has, newest first. */
export const useCustomerDocuments = (customerId: string) =>
  useQuery({ queryKey: ["admin", "customers", customerId, "documents"], queryFn: () => admin.get<CustomerDocumentRow[]>(`/documents/customer/${customerId}`), enabled: Boolean(customerId) });
export const useInvitePortalAccess = () =>
  useInvalidating((customerId: string) => admin.post<PortalAccessInfo & { emailed: boolean }>(`/customers/${customerId}/portal-access/invite`));
