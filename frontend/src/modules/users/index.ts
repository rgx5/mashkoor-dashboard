import { ShieldCheck, UserCog } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useStaffOptions, type StaffOption } from "./api";
export { StaffSelect } from "./StaffSelect";

/** M00 · Users — admin slice (staff). The B2B slice (agency users) arrives in Phase 3. */
export const usersModule: AppModule = {
  id: "users",
  admin: {
    nav: [
      { label: "Staff users", to: "users", icon: UserCog, can: ["read", "User"], feature: "users", group: "Administration" },
      { label: "Feature access", to: "users/access", icon: ShieldCheck, can: ["update", "User"], feature: "users", group: "Administration" },
    ],
    routes: [
      { path: "users", lazy: async () => ({ Component: (await import("./admin/UsersPage")).UsersPage }) },
      { path: "users/access", lazy: async () => ({ Component: (await import("./admin/FeatureAccessPage")).FeatureAccessPage }) },
    ],
  },
};
