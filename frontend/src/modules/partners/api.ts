import type { PartnerDetail, PartnerListQuery, PartnerRow, PartnerUpdateData, Paginated } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");
const partnersKey = ["admin", "partners"] as const;

export const usePartners = (filters: Partial<PartnerListQuery>) => useQuery({ queryKey: [...partnersKey, "list", filters], queryFn: () => admin.get<Paginated<PartnerRow>>("/partners", { ...filters }) });
export const usePartner = (id: string) => useQuery({ queryKey: [...partnersKey, "detail", id], queryFn: () => admin.get<PartnerDetail>(`/partners/${id}`), enabled: Boolean(id) });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: partnersKey }) });
}

export const useUpdatePartner = () => useInvalidating(({ id, input }: { id: string; input: PartnerUpdateData }) => admin.patch<PartnerDetail>(`/partners/${id}`, input));
export const useApprovePartner = () => useInvalidating((id: string) => admin.post<PartnerDetail>(`/partners/${id}/approve`));
export const useRejectPartner = () => useInvalidating(({ id, reason }: { id: string; reason: string }) => admin.post<PartnerDetail>(`/partners/${id}/reject`, { reason }));
export const useSuspendPartner = () => useInvalidating(({ id, reason }: { id: string; reason: string }) => admin.post<PartnerDetail>(`/partners/${id}/suspend`, { reason }));
export const useReinstatePartner = () => useInvalidating((id: string) => admin.post<PartnerDetail>(`/partners/${id}/reinstate`));
export const useInvitePartnerAdmin = () => useInvalidating(({ id, name, email }: { id: string; name: string; email: string }) => admin.post<{ id: string; email: string }>(`/partners/${id}/invite-admin`, { name, email }));
