import { Banknote } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** The forex desk — rates and stock, sales of foreign currency to customers, and purchases from dealers, in one page. */
export const forexModule: AppModule = {
  id: "forex",
  admin: {
    nav: [{ label: "Forex", to: "forex", icon: Banknote, can: ["read", "ForexTransaction"], feature: "forex", group: "Inventory" }],
    routes: [{ path: "forex", lazy: async () => ({ Component: (await import("./admin/ForexPage")).ForexPage }) }],
  },
};
