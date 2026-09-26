import type { CreateStaffUserInput, Paginated, Role, SessionUser, UpdateStaffUserInput, UserStatus } from "@mashkoor/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/client";

export type StaffUser = SessionUser & { lastLoginAt: string | null; createdAt: string };

export interface StaffFilters {
  page: number;
  q?: string;
  role?: Role | "";
  status?: UserStatus | "";
}

const admin = api("admin");
const keys = {
  all: ["admin", "users"] as const,
  list: (f: StaffFilters) => ["admin", "users", "list", f] as const,
};

export interface StaffOption {
  id: string;
  name: string;
  role: Role;
}

/** Active staff for owner / assignee pickers (used by leads, tasks and customers). */
export const useStaffOptions = () =>
  useQuery({ queryKey: ["admin", "users", "options"], queryFn: () => admin.get<StaffOption[]>("/users/options"), staleTime: 5 * 60_000 });

export const useStaffUsers = (filters: StaffFilters) =>
  useQuery({
    queryKey: keys.list(filters),
    queryFn: () => admin.get<Paginated<StaffUser>>("/users", { ...filters, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

function useUserMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: keys.all }) });
}

export const useInviteStaff = () => useUserMutation((input: CreateStaffUserInput) => admin.post<SessionUser>("/users", input));
export const useUpdateStaff = () => useUserMutation(({ id, ...input }: UpdateStaffUserInput & { id: string }) => admin.patch<SessionUser>(`/users/${id}`, input));
export const useSetStaffStatus = () => useUserMutation(({ id, enable }: { id: string; enable: boolean }) => admin.post<SessionUser>(`/users/${id}/${enable ? "enable" : "disable"}`));
export const useResendInvite = () => useUserMutation((id: string) => admin.post<{ message: string }>(`/users/${id}/resend-invite`));
