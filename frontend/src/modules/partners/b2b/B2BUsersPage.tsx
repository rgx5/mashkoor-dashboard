import { useSession } from "@/core/auth/session-store";
import { useAbility } from "@/core/rbac/ability";
import { PageHeader } from "@/core/ui/layout";
import { PartnerUsersPanel } from "../PartnerUsersPanel";

/** `/b2b/users` — an agency's Admin manages the team. */
export function B2BUsersPage() {
  const session = useSession("b2b");
  const ability = useAbility("b2b");
  return (
    <>
      <PageHeader title="Team" description="People at your agency who can sign in and create bookings." />
      <PartnerUsersPanel scope={{ portal: "b2b" }} currentUserId={session.user?.id} canManage={ability.can("invite", "User")} />
    </>
  );
}
