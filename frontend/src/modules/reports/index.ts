import { BookOpen, Building, CalendarRange, Clock, Filter, PieChart, TrendingUp, Trophy } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** M14 · Reports — eight reports rendered by one screen. Each one enforces its own permissions on the API. */
export const reportsModule: AppModule = {
  id: "reports",
  admin: {
    nav: [
      { label: "Sales register", to: "reports/sales", icon: TrendingUp, can: ["collect", "Booking"], group: "Reports" },
      { label: "Receivables ageing", to: "reports/ageing", icon: Clock, can: ["collect", "Booking"], group: "Reports" },
      { label: "Daybook", to: "reports/daybook", icon: BookOpen, can: ["collect", "Booking"], group: "Reports" },
      { label: "Lead sources", to: "reports/lead-sources", icon: PieChart, can: ["read", "Lead"], group: "Reports" },
      { label: "Leads funnel", to: "reports/leads-funnel", icon: Filter, can: ["read", "Lead"], group: "Reports" },
      { label: "Staff performance", to: "reports/staff-performance", icon: Trophy, can: ["manage", "Booking"], group: "Reports" },
      { label: "Partner activity", to: "reports/partner-activity", icon: Building, can: ["read", "Partner"], group: "Reports" },
      { label: "Upcoming travel", to: "reports/upcoming-travel", icon: CalendarRange, can: ["read", "Booking"], group: "Reports" },
    ],
    routes: [
      { path: "reports/sales", lazy: async () => ({ Component: (await import("./SalesRegisterPage")).SalesRegisterPage }) },
      { path: "reports/ageing", lazy: async () => ({ Component: (await import("./AgeingPage")).AgeingPage }) },
      { path: "reports/daybook", lazy: async () => ({ Component: (await import("./DaybookPage")).DaybookPage }) },
      { path: "reports/lead-sources", lazy: async () => ({ Component: (await import("./LeadSourcesPage")).LeadSourcesPage }) },
      { path: "reports/leads-funnel", lazy: async () => ({ Component: (await import("./LeadsFunnelPage")).LeadsFunnelPage }) },
      { path: "reports/staff-performance", lazy: async () => ({ Component: (await import("./StaffPerformancePage")).StaffPerformancePage }) },
      { path: "reports/partner-activity", lazy: async () => ({ Component: (await import("./PartnerActivityPage")).PartnerActivityPage }) },
      { path: "reports/:name", lazy: async () => ({ Component: (await import("./ReportPage")).ReportPage }) },
    ],
  },
};
