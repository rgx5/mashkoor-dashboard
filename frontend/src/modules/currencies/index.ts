import { Coins } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useCurrencies } from "./api";

/** Currencies a quotation line can be priced in, and today's rate to INR. */
export const currenciesModule: AppModule = {
  id: "currencies",
  admin: {
    nav: [{ label: "Currencies", to: "currencies", icon: Coins, can: ["read", "Currency"], group: "Inventory" }],
    routes: [{ path: "currencies", lazy: async () => ({ Component: (await import("./admin/CurrenciesPage")).CurrenciesPage }) }],
  },
};
