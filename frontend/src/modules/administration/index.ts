import { FileUp, Inbox, Mail, ScrollText } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** M12 + M13 + M15 · Email log & integrations, inbound events, audit log viewer, CSV import. */
export const administrationModule: AppModule = {
  id: "administration",
  admin: {
    nav: [
      { label: "Inbound events", to: "inbound-events", icon: Inbox, can: ["read", "InboundEvent"], feature: "administration", group: "Administration" },
      { label: "Emails", to: "notifications", icon: Mail, can: ["read", "NotificationLog"], feature: "administration", group: "Administration" },
      { label: "Audit log", to: "audit-log", icon: ScrollText, can: ["read", "AuditLog"], feature: "administration", group: "Administration" },
      { label: "Import data", to: "import", icon: FileUp, can: ["create", "Customer"], feature: "administration", group: "Administration" },
    ],
    routes: [
      { path: "inbound-events", lazy: async () => ({ Component: (await import("./admin/InboundEventsPage")).InboundEventsPage }) },
      { path: "notifications", lazy: async () => ({ Component: (await import("./admin/NotificationsPage")).NotificationsPage }) },
      { path: "audit-log", lazy: async () => ({ Component: (await import("./admin/AuditLogPage")).AuditLogPage }) },
      { path: "import", lazy: async () => ({ Component: (await import("./admin/ImportPage")).ImportPage }) },
    ],
  },
};
