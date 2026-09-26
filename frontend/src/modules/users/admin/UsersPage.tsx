import { ROLE_LABELS, STAFF_ROLES, USER_STATUS_LABELS, USER_STATUSES, type Role, type UserStatus } from "@mashkoor/shared";
import { MailPlus, Search, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/core/api/client";
import { useSession } from "@/core/auth/session-store";
import { Can } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { DataTable, type Column } from "@/core/ui/DataTable";
import { inputClass } from "@/core/ui/form";
import { Badge, PageHeader } from "@/core/ui/layout";
import { useResendInvite, useSetStaffStatus, useStaffUsers, type StaffUser } from "../api";
import { InviteUserDialog } from "./InviteUserDialog";

const statusTone = { ACTIVE: "green", INVITED: "amber", DISABLED: "red" } as const;

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const [inviteOpen, setInviteOpen] = useState(false);
  const { user: me } = useSession("admin");

  // Filters live in the URL so views can be shared and survive refresh.
  const filters = {
    page: Number(params.get("page") ?? 1),
    q: params.get("q") ?? "",
    role: (params.get("role") ?? "") as Role | "",
    status: (params.get("status") ?? "") as UserStatus | "",
  };
  const setFilter = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });

  const { data, isLoading, error } = useStaffUsers(filters);
  const setStatus = useSetStaffStatus();
  const resend = useResendInvite();

  const run = async (action: Promise<unknown>, success: string) => {
    try {
      await action;
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed");
    }
  };

  const columns: Column<StaffUser>[] = [
    {
      key: "name",
      header: "Name",
      cell: (u) => (
        <div>
          <p className="font-semibold text-ink-900">
            {u.name} {u.id === me?.id && <span className="text-xs font-normal text-ink-500">(you)</span>}
          </p>
          <p className="text-xs text-ink-500">{u.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (u) => <Badge tone="plum">{ROLE_LABELS[u.role]}</Badge> },
    { key: "status", header: "Status", cell: (u) => <Badge tone={statusTone[u.status]}>{USER_STATUS_LABELS[u.status]}</Badge> },
    { key: "lastLogin", header: "Last sign-in", className: "hidden md:table-cell", cell: (u) => <span className="text-ink-500">{u.lastLoginAt ? dateFormat.format(new Date(u.lastLoginAt)) : "—"}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (u) => (
        <div className="flex justify-end gap-1">
          {u.status === "INVITED" && (
            <Can portal="admin" I="invite" a="User" this={u}>
              <Button variant="ghost" size="sm" onClick={() => run(resend.mutateAsync(u.id), `Invitation re-sent to ${u.email}`)}>
                <MailPlus className="h-4 w-4" aria-hidden /> Resend
              </Button>
            </Can>
          )}
          {u.status !== "INVITED" && (
            <Can portal="admin" I="disable" a="User" this={u}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const enable = u.status === "DISABLED";
                  if (!enable && !window.confirm(`Disable ${u.name}? They will be signed out immediately.`)) return;
                  void run(setStatus.mutateAsync({ id: u.id, enable }), enable ? `${u.name} enabled` : `${u.name} disabled`);
                }}
              >
                {u.status === "DISABLED" ? "Enable" : "Disable"}
              </Button>
            </Can>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Staff users"
        description="People who can sign in to the Mashkoor control center."
        actions={
          <Can portal="admin" I="create" a="User">
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden /> Invite user
            </Button>
          </Can>
        }
      >
        <label className="relative flex-1">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-300" aria-hidden />
          <input type="search" defaultValue={filters.q} placeholder="Search name, email or mobile" className={`${inputClass} pl-9`} onChange={(e) => setFilter("q", e.target.value)} />
        </label>
        <select aria-label="Role" value={filters.role} onChange={(e) => setFilter("role", e.target.value)} className={`${inputClass} sm:w-52`}>
          <option value="">All roles</option>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={`${inputClass} sm:w-40`}>
          <option value="">All statuses</option>
          {USER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {USER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </PageHeader>

      <DataTable
        columns={columns}
        rows={data?.data}
        rowKey={(u) => u.id}
        loading={isLoading}
        error={error ? (error instanceof ApiError ? error.message : "Unable to load users") : null}
        empty={{ icon: Users, title: "No users found", description: "Try a different search or filter." }}
        page={filters.page}
        pageSize={data?.meta.pageSize ?? 20}
        total={data?.meta.total ?? 0}
        onPageChange={(p) => setFilter("page", String(p))}
      />

      <InviteUserDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
