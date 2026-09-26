import { portalSlices, type AppModule } from "@/core/modules/types";
import { bookingsModule } from "@/modules/bookings";
import { customersModule } from "@/modules/customers";
import { itinerariesModule } from "@/modules/itineraries";
import { leadsModule } from "@/modules/leads";

/** Modules available in the B2C portal. Trips, shared plans, requests and profile. */
const modules: AppModule[] = [bookingsModule, itinerariesModule, leadsModule, customersModule];

const slices = portalSlices(modules, "b2c");
export const b2cNav = slices.flatMap((s) => s.nav ?? []);
export const b2cRoutes = slices.flatMap((s) => s.routes);
