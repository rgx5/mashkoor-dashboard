import type { Paginated, Task, TaskInput, TaskStatus } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

const admin = api("admin");

export interface TaskFilters {
  due?: "overdue" | "today" | "upcoming" | "all";
  status?: TaskStatus;
  assignee?: string;
  leadId?: string;
  customerId?: string;
}

export type TaskList = Paginated<Task> & { counts: { overdue: number; today: number; upcoming: number } };

export const useTasks = (filters: TaskFilters) =>
  useQuery({
    queryKey: ["admin", "tasks", filters],
    queryFn: () => admin.get<TaskList>("/tasks", { ...filters }),
    placeholderData: keepPreviousData,
  });

export function useCreateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => admin.post<Task>("/tasks", input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tasks"] }),
  });
}

export function useUpdateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<TaskInput> & { id: string; status?: TaskStatus }) => admin.patch<Task>(`/tasks/${id}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tasks"] }),
  });
}
