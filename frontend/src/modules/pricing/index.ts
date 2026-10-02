import { Tags } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** M06 · Pricing engine — rules and calculator. */
export const pricingModule: AppModule = {
  id: "pricing",
  admin: {
    nav: [{ label: "Pricing rules", to: "pricing-rules", icon: Tags, can: ["read", "PricingRule"], feature: "pricing", group: "Inventory" }],
    routes: [{ path: "pricing-rules", lazy: async () => ({ Component: (await import("./admin/PricingRulesPage")).PricingRulesPage }) }],
  },
};
