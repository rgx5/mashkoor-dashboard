import { ReceiptText } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useCreateInvoice } from "./api";

/** Invoices raised by the accountant from an accepted quotation, with an entry for every payment made against them. */
export const invoicesModule: AppModule = {
  id: "invoices",
  admin: {
    nav: [{ label: "Invoices", to: "invoices", icon: ReceiptText, can: ["read", "Invoice"], feature: "invoices", group: "Operations" }],
    routes: [
      { path: "invoices", lazy: async () => ({ Component: (await import("./admin/InvoicesPage")).InvoicesPage }) },
      { path: "invoices/:id", lazy: async () => ({ Component: (await import("./admin/InvoiceDetailPage")).InvoiceDetailPage }) },
    ],
  },
};
