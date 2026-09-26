import { Building, UserCircle, Users } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** M08 · Partners & KYC — admin directory; the agency's own profile in the B2B portal. */
export const partnersModule: AppModule = {
  id: "partners",
  admin: {
    nav: [{ label: "Partners", to: "partners", icon: Building, can: ["read", "Partner"], group: "Partners" }],
    routes: [
      { path: "partners", lazy: async () => ({ Component: (await import("./admin/PartnersPage")).PartnersPage }) },
      { path: "partners/:id", lazy: async () => ({ Component: (await import("./admin/PartnerDetailPage")).PartnerDetailPage }) },
    ],
  },
  b2b: {
    nav: [
      { label: "Profile", to: "profile", icon: UserCircle },
      { label: "Team", to: "users", icon: Users, can: ["invite", "User"] },
    ],
    routes: [
      { path: "profile", lazy: async () => ({ Component: (await import("./b2b/B2BProfilePage")).B2BProfilePage }) },
      { path: "users", lazy: async () => ({ Component: (await import("./b2b/B2BUsersPage")).B2BUsersPage }) },
    ],
  },
};
