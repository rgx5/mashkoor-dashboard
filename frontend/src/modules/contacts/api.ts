import type { ContactData, ContactListQuery, ContactRow, ContactUpdateData, Paginated } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");
const key = ["admin", "contacts"] as const;

export const useContacts = (filters: Partial<ContactListQuery>) =>
  useQuery({ queryKey: [...key, "list", filters], queryFn: () => admin.get<Paginated<ContactRow>>("/contacts", { pageSize: 25, ...filters }), placeholderData: keepPreviousData });

function useInvalidating<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: key }) });
}

export const useCreateContact = () => useInvalidating((input: ContactData) => admin.post<ContactRow>("/contacts", input));
export const useUpdateContact = () => useInvalidating(({ id, input }: { id: string; input: ContactUpdateData }) => admin.patch<ContactRow>(`/contacts/${id}`, input));
export const useMarkContacted = () => useInvalidating((id: string) => admin.post<ContactRow>(`/contacts/${id}/mark-contacted`));
export const useDeleteContact = () => useInvalidating((id: string) => admin.delete<void>(`/contacts/${id}`));
