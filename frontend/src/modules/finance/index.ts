import { BookOpenText, Landmark, Scale } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** Accounts — the ledger of every rupee in and out, an overview, and what each booking has collected and paid out. */
export const financeModule: AppModule = {
  id: "finance",
  admin: {
    nav: [
      { label: "Overview", to: "accounts", icon: Landmark, can: ["read", "FinanceEntry"], feature: "accounts", group: "Accounts" },
      { label: "Ledger", to: "accounts/ledger", icon: BookOpenText, can: ["read", "FinanceEntry"], feature: "accounts", group: "Accounts" },
      { label: "Booking profit", to: "accounts/bookings", icon: Scale, can: ["read", "FinanceEntry"], feature: "accounts", group: "Accounts" },
    ],
    routes: [
      { path: "accounts", lazy: async () => ({ Component: (await import("./admin/FinanceOverviewPage")).FinanceOverviewPage }) },
      { path: "accounts/ledger", lazy: async () => ({ Component: (await import("./admin/LedgerPage")).LedgerPage }) },
      { path: "accounts/bookings", lazy: async () => ({ Component: (await import("./admin/FinanceBookingsPage")).FinanceBookingsPage }) },
    ],
  },
};
