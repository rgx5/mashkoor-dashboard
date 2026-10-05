import { ArrowLeftRight, Banknote, PackagePlus } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** The forex desk — rates and stock, sales of foreign currency to customers, and purchases from dealers. */
export const forexModule: AppModule = {
  id: "forex",
  admin: {
    nav: [
      { label: "Rates & stock", to: "forex", icon: Banknote, can: ["read", "ForexTransaction"], feature: "forex", group: "Forex" },
      { label: "Customer deals", to: "forex/transactions", icon: ArrowLeftRight, can: ["read", "ForexTransaction"], feature: "forex", group: "Forex" },
      { label: "Dealer purchases", to: "forex/purchases", icon: PackagePlus, can: ["read", "ForexTransaction"], feature: "forex", group: "Forex" },
    ],
    routes: [
      { path: "forex", lazy: async () => ({ Component: (await import("./admin/ForexOverviewPage")).ForexOverviewPage }) },
      { path: "forex/transactions", lazy: async () => ({ Component: (await import("./admin/ForexTransactionsPage")).ForexTransactionsPage }) },
      { path: "forex/purchases", lazy: async () => ({ Component: (await import("./admin/ForexPurchasesPage")).ForexPurchasesPage }) },
    ],
  },
};
