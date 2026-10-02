import type { Portal, Role } from "@mashkoor/shared";

/** Identity attached to `request.user` by AccessTokenGuard. Scoping IDs always come from the token, never from input. */
export interface RequestUser {
  id: string;
  portal: Portal;
  role: Role;
  partnerId: string | null;
  customerId: string | null;
  /** Dashboard areas switched on for this staff member (read from the database with the rest of their state). */
  features: string[];
}
