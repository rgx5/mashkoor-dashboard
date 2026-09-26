import { Building } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** Letterhead, tax, bank and standard terms used on quotations. */
export const companyModule: AppModule = {
  id: "company",
  admin: {
    nav: [{ label: "Company profile", to: "company-profile", icon: Building, can: ["update", "Setting"], group: "Administration" }],
    routes: [{ path: "company-profile", lazy: async () => ({ Component: (await import("./admin/CompanyProfilePage")).CompanyProfilePage }) }],
  },
};
