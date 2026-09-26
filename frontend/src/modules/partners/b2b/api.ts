import type { PartnerDetail, PartnerUpdateData } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const b2b = api("b2b");

export const useMyProfile = () => useQuery({ queryKey: ["b2b", "profile"], queryFn: () => b2b.get<PartnerDetail>("/profile") });

export function useUpdateMyProfile() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: PartnerUpdateData) => b2b.patch<PartnerDetail>("/profile", input), onSuccess: () => client.invalidateQueries({ queryKey: ["b2b", "profile"] }) });
}
