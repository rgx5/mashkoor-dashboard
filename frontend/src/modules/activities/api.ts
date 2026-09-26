import type { Activity, ActivityEntityType, ActivityInput } from "@mashkoor/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");

export const activityKeys = {
  entity: (entityType: ActivityEntityType, entityId: string) => ["admin", "activities", entityType, entityId] as const,
};

export const useActivities = (entityType: ActivityEntityType, entityId: string) =>
  useQuery({
    queryKey: activityKeys.entity(entityType, entityId),
    queryFn: () => admin.get<Activity[]>("/activities", { entityType, entityId, limit: 200 }),
  });

export function useLogActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivityInput) => admin.post<Activity>("/activities", input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin"] }),
  });
}
