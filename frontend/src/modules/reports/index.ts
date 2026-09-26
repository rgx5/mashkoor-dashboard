import { BookOpen, Clock, PieChart, TrendingUp, Trophy } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** M14 · Reports — five reports rendered by one screen. Each one enforces its own permissions on the API. */
export const reportsModule: AppModule = {
  id: "reports",
  admin: {
    nav: [
      { label: "Sales register", to: "reports/sales", icon: TrendingUp, can: ["read", "Booking"], group: "Reports" },
      { label: "Receivables ageing", to: "reports/ageing", icon: Clock, can: ["read", "Booking"], group: "Reports" },
      { label: "Daybook", to: "reports/daybook", icon: BookOpen, can: ["read", "Booking"], group: "Reports" },
      { label: "Lead sources", to: "reports/lead-sources", icon: PieChart, can: ["read", "Lead"], group: "Reports" },
      { label: "Staff performance", to: "reports/staff-performance", icon: Trophy, can: ["manage", "Booking"], group: "Reports" },
    ],
    routes: [{ path: "reports/:name", lazy: async () => ({ Component: (await import("./ReportPage")).ReportPage }) }],
  },
};
