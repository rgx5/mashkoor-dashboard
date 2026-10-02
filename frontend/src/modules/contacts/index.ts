import { Contact2 } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** A small rolodex — suppliers, agents, general contacts. Not a customer, not a financial record. */
export const contactsModule: AppModule = {
  id: "contacts",
  admin: {
    nav: [{ label: "Contacts", to: "contacts", icon: Contact2, can: ["read", "Contact"], feature: "contacts", group: "CRM" }],
    routes: [{ path: "contacts", lazy: async () => ({ Component: (await import("./admin/ContactsPage")).ContactsPage }) }],
  },
};
