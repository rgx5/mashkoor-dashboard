import { Inbox } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useAssignEnquiry, useEnquiryBoard } from "./api";
export { ContactedDialog, ConvertDialog, NewEnquiryDialog } from "./admin/EnquiryDialogs";

/** Raw enquiries: the admin assigns each to a sales rep, who calls and converts it into a lead. */
export const enquiriesModule: AppModule = {
  id: "enquiries",
  admin: {
    nav: [{ label: "Enquiries", to: "enquiries", icon: Inbox, can: ["read", "Enquiry"], feature: "enquiries", group: "CRM" }],
    routes: [
      { path: "enquiries", lazy: async () => ({ Component: (await import("./admin/EnquiriesPage")).EnquiriesPage }) },
      { path: "home-preview", lazy: async () => ({ Component: (await import("./admin/HomePreviewPage")).HomePreviewPage }) },
    ],
  },
};
