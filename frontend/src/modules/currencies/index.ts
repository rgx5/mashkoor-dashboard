import { Coins } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useCurrencies } from "./api";

/** Currencies a quotation, hotel rate or transport price can be in, the reference rate to INR, and how it moved. */
export const currenciesModule: AppModule = {
  id: "currencies",
  admin: {
    nav: [{ label: "Currencies", to: "currencies", icon: Coins, can: ["read", "Currency"], feature: "currencies", group: "Inventory" }],
    routes: [{ path: "currencies", lazy: async () => ({ Component: (await import("./admin/CurrenciesPage")).CurrenciesPage }) }],
  },
};
