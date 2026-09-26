import { UserCircle, Users } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { DuplicateNotice } from "./DuplicateNotice";
export { lookupCustomers, useCustomer, useCustomers, type DuplicateMatch } from "./api";

/** M01 · Customers & Travellers — admin (Customer 360) and B2B (agency customers) slices. */
export const customersModule: AppModule = {
  id: "customers",
  admin: {
    nav: [{ label: "Customers", to: "customers", icon: Users, can: ["read", "Customer"], group: "CRM" }],
    routes: [
      { path: "customers", lazy: async () => ({ Component: (await import("./admin/CustomersPage")).CustomersPage }) },
      { path: "customers/:id", lazy: async () => ({ Component: (await import("./admin/CustomerDetailPage")).CustomerDetailPage }) },
    ],
  },
  b2b: {
    nav: [{ label: "Customers", to: "customers", icon: Users }],
    routes: [{ path: "customers", lazy: async () => ({ Component: (await import("./b2b/B2BCustomersPage")).B2BCustomersPage }) }],
  },
  b2c: {
    nav: [{ label: "Profile", to: "profile", icon: UserCircle }],
    routes: [{ path: "profile", lazy: async () => ({ Component: (await import("./b2c/B2CProfilePage")).B2CProfilePage }) }],
  },
};
