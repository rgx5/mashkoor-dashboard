import type { Portal, StaffFeature } from "@mashkoor/shared";
import type { LucideIcon } from "lucide-react";
import type { RouteObject } from "react-router";

export interface NavItem {
  label: string;
  /** Path relative to the portal root, e.g. "users" → /admin/users */
  to: string;
  icon: LucideIcon;
  /** Hide the item unless the user `can(action, subject)`. */
  can?: [action: string, subject: string];
  group?: string;
  /** The dashboard area that has to be switched on for this staff member to see the item (super admins see everything). */
  feature?: StaffFeature;
}

export interface PortalSlice {
  nav?: NavItem[];
  /** Routes relative to the portal root. Use `lazy` so each portal only downloads what it needs. */
  routes: RouteObject[];
}

/**
 * A business module's contribution to each portal (IMPLEMENTATION_ROADMAP §2.3).
 * Portals never contain business screens themselves — they assemble module slices.
 */
export type AppModule = { id: string } & Partial<Record<Portal, PortalSlice>>;

export const portalSlices = (modules: AppModule[], portal: Portal) =>
  modules.flatMap((m) => (m[portal] ? [{ id: m.id, ...m[portal]! }] : []));
