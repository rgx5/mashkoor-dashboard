import type { EnquiryBoard, EnquiryConvertInput, EnquiryInput, EnquiryRow, EnquiryStatus, LeadDetail } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");
const key = ["admin", "enquiries"] as const;

export const useEnquiryBoard = (filters: { owner?: string; q?: string }, enabled = true) =>
  useQuery({ enabled, queryKey: [...key, "board", filters], queryFn: () => admin.get<EnquiryBoard>("/enquiries/board", { ...filters }), placeholderData: keepPreviousData });

function useEnquiryMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  // Enquiries feed the dashboard and (on conversion) the leads board, so refresh everything in the admin portal.
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }) });
}

export const useCreateEnquiry = () => useEnquiryMutation((input: EnquiryInput) => admin.post<EnquiryRow>("/enquiries", input));
export const useAssignEnquiry = () => useEnquiryMutation(({ id, ownerId }: { id: string; ownerId: string | null }) => admin.post<EnquiryRow>(`/enquiries/${id}/assign`, { ownerId }));
export const useEnquiryStatus = () => useEnquiryMutation(({ id, status, note }: { id: string; status: EnquiryStatus; note?: string | null }) => admin.post<EnquiryRow>(`/enquiries/${id}/status`, { status, note }));
export const useConvertEnquiry = () => useEnquiryMutation(({ id, ...input }: EnquiryConvertInput & { id: string }) => admin.post<LeadDetail>(`/enquiries/${id}/convert`, input));
