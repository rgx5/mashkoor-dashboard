import type { AuditListQuery, AuditLogRow, ImportEntity, ImportResult, InboundEventListQuery, InboundEventRow, IntegrationStatus, NotificationListQuery, NotificationRow, Paginated } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");
const key = ["admin", "administration"] as const;

export const useNotifications = (filters: Partial<NotificationListQuery>) =>
  useQuery({ queryKey: [...key, "notifications", filters], queryFn: () => admin.get<Paginated<NotificationRow>>("/notifications", { pageSize: 25, ...filters }), placeholderData: keepPreviousData });
export const useIntegrations = () => useQuery({ queryKey: [...key, "integrations"], queryFn: () => admin.get<IntegrationStatus>("/integrations") });
export const useAuditLog = (filters: Partial<AuditListQuery>) =>
  useQuery({ queryKey: [...key, "audit", filters], queryFn: () => admin.get<Paginated<AuditLogRow>>("/audit-logs", { pageSize: 30, ...filters }), placeholderData: keepPreviousData });
export const useAuditEntityTypes = () => useQuery({ queryKey: [...key, "audit-types"], queryFn: () => admin.get<string[]>("/audit-logs/entity-types"), staleTime: 60_000 });

export const useInboundEvents = (filters: Partial<InboundEventListQuery>) =>
  useQuery({ queryKey: [...key, "inbound", filters], queryFn: () => admin.get<Paginated<InboundEventRow>>("/inbound-events", { pageSize: 25, ...filters }), placeholderData: keepPreviousData });
export const useReplayInboundEvent = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => admin.post<InboundEventRow>(`/inbound-events/${id}/replay`), onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }) });
};

export const useResendNotification = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => admin.post<{ status: string; error: string | null }>(`/notifications/${id}/resend`), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
};
export const useSendTestEmail = () => {
  const client = useQueryClient();
  return useMutation({ mutationFn: (to: string) => admin.post<{ status: string; error: string | null; provider: string }>("/notifications/test", { to }), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
};
export const useRunImport = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { entity: ImportEntity; commit: boolean; rows: Record<string, string>[] }) => admin.post<ImportResult>("/import", input),
    onSuccess: (result) => {
      if (result.committed) void client.invalidateQueries({ queryKey: ["admin"] });
    },
  });
};
