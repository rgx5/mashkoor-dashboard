import { UserCog } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useStaffOptions, type StaffOption } from "./api";
export { StaffSelect } from "./StaffSelect";

/** M00 · Users — admin slice (staff). The B2B slice (agency users) arrives in Phase 3. */
export const usersModule: AppModule = {
  id: "users",
  admin: {
    nav: [{ label: "Staff users", to: "users", icon: UserCog, can: ["read", "User"], group: "Administration" }],
    routes: [{ path: "users", lazy: async () => ({ Component: (await import("./admin/UsersPage")).UsersPage }) }],
  },
};
