import { partnerUserInviteSchema, type PartnerUserInvite, type PartnerUserRow } from "@mashkoor/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, Power, Send, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { api } from "@/core/api/client";
import { applyApiErrors, errorMessage } from "@/core/api/errors";
import { formatDateTime } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextField } from "@/core/ui/form";
import { Badge, Card, EmptyState } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";

type Scope = { portal: "b2b" } | { portal: "admin"; partnerId: string };
type FormInput = z.input<typeof partnerUserInviteSchema>;

const base = (scope: Scope) => (scope.portal === "b2b" ? { client: api("b2b"), path: "/users", key: ["b2b", "users"] } : { client: api("admin"), path: `/partners/${scope.partnerId}/users`, key: ["admin", "partners", scope.partnerId, "users"] });

function useAgencyUsers(scope: Scope) {
  const { client, path, key } = base(scope);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: key, queryFn: () => client.get<PartnerUserRow[]>(path) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const invite = useMutation({ mutationFn: (input: PartnerUserInvite) => client.post<PartnerUserRow>(path, input), onSuccess: refresh });
  const setActive = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => client.post<PartnerUserRow>(`${path}/${id}/${active ? "enable" : "disable"}`), onSuccess: refresh });
  const resend = useMutation({ mutationFn: (id: string) => client.post<{ message: string }>(`${path}/${id}/resend-invite`) });
  return { list, invite, setActive, resend };
}

const statusTone = (s: PartnerUserRow["status"]) => (s === "ACTIVE" ? "green" : s === "INVITED" ? "amber" : "red");

/** An agency's people. A Partner Admin manages their own team; Mashkoor staff can manage any agency's. */
export function PartnerUsersPanel({ scope, currentUserId, canManage }: { scope: Scope; currentUserId?: string; canManage: boolean }) {
  const { list, invite, setActive, resend } = useAgencyUsers(scope);
  const [inviting, setInviting] = useState(false);

  const act = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Team</h2>
        {canManage && (
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus className="h-4 w-4" aria-hidden /> Add user
          </Button>
        )}
      </div>
      {list.isLoading && <Spinner />}
      {list.error && <p className="text-sm text-red-600">{errorMessage(list.error)}</p>}
      {list.data?.length === 0 && <EmptyState icon={MailPlus} title="No users yet" description="Invite colleagues so they can create bookings and enquiries for the agency." />}
      <ul className="divide-y divide-line">
        {list.data?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span>
              <span className="font-semibold">{u.name}</span> <Badge tone={statusTone(u.status)}>{u.status.charAt(0) + u.status.slice(1).toLowerCase()}</Badge>{" "}
              {u.role === "PARTNER_ADMIN" && <Badge tone="plum">Admin</Badge>}
              <span className="block text-xs text-ink-500">
                {u.email} · {u.lastLoginAt ? `Last sign-in ${formatDateTime(u.lastLoginAt)}` : "Never signed in"}
              </span>
            </span>
            {canManage && u.id !== currentUserId && (
              <span className="flex gap-1">
                {u.status === "INVITED" && (
                  <Button variant="ghost" size="sm" onClick={() => void act(() => resend.mutateAsync(u.id), "Invitation sent again")}>
                    <Send className="h-4 w-4" aria-hidden /> Resend
                  </Button>
                )}
                {u.status !== "INVITED" && (
                  <Button variant="ghost" size="sm" onClick={() => void act(() => setActive.mutateAsync({ id: u.id, active: u.status === "DISABLED" }), u.status === "DISABLED" ? "User enabled" : "User disabled")}>
                    <Power className="h-4 w-4" aria-hidden /> {u.status === "DISABLED" ? "Enable" : "Disable"}
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {inviting && <InviteDialog onClose={() => setInviting(false)} onInvite={(input) => invite.mutateAsync(input)} pending={invite.isPending} />}
    </Card>
  );
}

function InviteDialog({ onClose, onInvite, pending }: { onClose: () => void; onInvite: (input: PartnerUserInvite) => Promise<unknown>; pending: boolean }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormInput, unknown, PartnerUserInvite>({ resolver: zodResolver(partnerUserInviteSchema), defaultValues: { name: "", email: "", role: "PARTNER_USER" } });

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onInvite(values);
      toast.success("Invitation sent");
      onClose();
    } catch (e) {
      setFormError(applyApiErrors(e, form.setError));
    }
  });

  return (
    <Dialog open onClose={onClose} title="Add a user" description="They'll get an email with a link to set their password.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={formError} />
        <TextField label="Full name" required autoFocus error={form.formState.errors.name?.message} {...form.register("name")} />
        <TextField label="Email" type="email" required error={form.formState.errors.email?.message} {...form.register("email")} />
        <SelectField label="Role" {...form.register("role")}>
          <option value="PARTNER_USER">User — can create bookings and enquiries</option>
          <option value="PARTNER_ADMIN">Admin — can also manage the team and profile</option>
        </SelectField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Send invitation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
