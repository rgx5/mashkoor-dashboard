import type { LeadBoard, LeadDetail, LeadInput, LeadPriority, LeadRow, LeadSource, LeadStage, LostReason, Paginated, ProductType, TripType } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");

export interface LeadFilters {
  page?: number;
  q?: string;
  stage?: LeadStage | "";
  source?: LeadSource | "";
  productType?: ProductType | "";
  tripType?: TripType | "";
  priority?: LeadPriority | "";
  owner?: string;
  followUp?: "overdue" | "today" | "week" | "";
  customerId?: string;
  sort?: string;
}

export const leadKeys = {
  all: ["admin", "leads"] as const,
  detail: (id: string) => ["admin", "leads", "detail", id] as const,
};

export const useLeads = (filters: LeadFilters) =>
  useQuery({
    queryKey: [...leadKeys.all, "list", filters],
    queryFn: () => admin.get<Paginated<LeadRow>>("/leads", { ...filters, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

export const useLeadBoard = (filters: Omit<LeadFilters, "page" | "stage" | "sort">, enabled = true) =>
  useQuery({
    enabled,
    queryKey: [...leadKeys.all, "board", filters],
    queryFn: () => admin.get<LeadBoard>("/leads/board", { ...filters }),
    placeholderData: keepPreviousData,
  });

export const useLead = (id: string) => useQuery({ queryKey: leadKeys.detail(id), queryFn: () => admin.get<LeadDetail>(`/leads/${id}`) });

function useLeadMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }) });
}

export const useCreateLead = () => useLeadMutation((input: LeadInput) => admin.post<LeadDetail>("/leads", input));
export const useUpdateLead = () => useLeadMutation(({ id, ...input }: Partial<LeadInput> & { id: string }) => admin.patch<LeadDetail>(`/leads/${id}`, input));
export const useAssignLead = () => useLeadMutation(({ id, ownerId }: { id: string; ownerId: string | null }) => admin.post<LeadDetail>(`/leads/${id}/assign`, { ownerId }));
export const useAssignAccountant = () => useLeadMutation(({ id, accountantId }: { id: string; accountantId: string | null }) => admin.post<LeadDetail>(`/leads/${id}/accountant`, { accountantId }));
export const useConvertLead = () => useLeadMutation(({ id, customerId }: { id: string; customerId?: string }) => admin.post<LeadDetail>(`/leads/${id}/convert-customer`, { customerId }));
export const useBulkUpdateLeads = () => useLeadMutation((input: { ids: string[]; ownerId?: string | null; priority?: LeadPriority }) => admin.post<{ updated: number }>("/leads/bulk", input));

/** Stage changes update the board optimistically so drag-and-drop feels instant. */
export function useChangeStage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; stage: LeadStage; lostReason?: LostReason | null; note?: string | null }) => admin.post<LeadDetail>(`/leads/${id}/stage`, body),
    onMutate: async ({ id, stage }) => {
      await client.cancelQueries({ queryKey: [...leadKeys.all, "board"] });
      const snapshots = client.getQueriesData<LeadBoard>({ queryKey: [...leadKeys.all, "board"] });
      for (const [key, board] of snapshots) {
        if (!board) continue;
        const from = (Object.keys(board) as (keyof LeadBoard)[]).find((s) => board[s].leads.some((l) => l.id === id));
        if (!from || from === stage || !(stage in board)) continue;
        const lead = board[from].leads.find((l) => l.id === id)!;
        const to = stage as keyof LeadBoard;
        client.setQueryData<LeadBoard>(key, {
          ...board,
          [from]: { total: board[from].total - 1, leads: board[from].leads.filter((l) => l.id !== id) },
          [to]: { total: board[to].total + 1, leads: [{ ...lead, stage }, ...board[to].leads] },
        });
      }
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      for (const [key, board] of context?.snapshots ?? []) client.setQueryData(key, board);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["admin"] }),
  });
}
