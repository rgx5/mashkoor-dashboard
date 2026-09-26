import type { Portal, Role } from "@mashkoor/shared";

/** Identity attached to `request.user` by AccessTokenGuard. Scoping IDs always come from the token, never from input. */
export interface RequestUser {
  id: string;
  portal: Portal;
  role: Role;
  partnerId: string | null;
  customerId: string | null;
}
