import { portalSlices, type AppModule } from "@/core/modules/types";
import { bookingsModule } from "@/modules/bookings";
import { customersModule } from "@/modules/customers";
import { leadsModule } from "@/modules/leads";
import { partnersModule } from "@/modules/partners";
import { walletModule } from "@/modules/wallet";

/** Modules available in the B2B portal. */
const modules: AppModule[] = [customersModule, leadsModule, bookingsModule, walletModule, partnersModule];

const slices = portalSlices(modules, "b2b");
export const b2bNav = slices.flatMap((s) => s.nav ?? []);
export const b2bRoutes = slices.flatMap((s) => s.routes);
