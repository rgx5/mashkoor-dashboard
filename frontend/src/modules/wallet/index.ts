import { Wallet } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

/** M09 · Wallet & credit — embedded in Partners (admin); its own page in the B2B portal. */
export { useAdjustWallet, useSetCreditLimit, useTopUpWallet, useWalletLedger, useWalletSummary } from "./api";

export const walletModule: AppModule = {
  id: "wallet",
  b2b: {
    nav: [{ label: "Wallet", to: "wallet", icon: Wallet }],
    routes: [{ path: "wallet", lazy: async () => ({ Component: (await import("./b2b/B2BWalletPage")).B2BWalletPage }) }],
  },
};
