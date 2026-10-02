import { Target } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useAssignAccountant, useLeadBoard, useLeads } from "./api";
export { StageChangeDialog, type PendingStageChange } from "./StageChangeDialog";

/** M02 · Leads & pipeline — admin and B2B (enquiries to Mashkoor) slices. */
export const leadsModule: AppModule = {
  id: "leads",
  admin: {
    nav: [{ label: "Leads", to: "leads", icon: Target, can: ["read", "Lead"], group: "CRM" }],
    routes: [
      { path: "leads", lazy: async () => ({ Component: (await import("./admin/LeadsPage")).LeadsPage }) },
      { path: "leads/:id", lazy: async () => ({ Component: (await import("./admin/LeadDetailPage")).LeadDetailPage }) },
    ],
  },
  b2b: {
    nav: [{ label: "Enquiries", to: "enquiries", icon: Target }],
    routes: [{ path: "enquiries", lazy: async () => ({ Component: (await import("./b2b/B2BEnquiriesPage")).B2BEnquiriesPage }) }],
  },
  b2c: {
    nav: [{ label: "Requests", to: "requests", icon: Target }],
    routes: [{ path: "requests", lazy: async () => ({ Component: (await import("./b2c/B2CRequestsPage")).B2CRequestsPage }) }],
  },
};
