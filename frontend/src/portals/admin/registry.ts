import { portalSlices, type AppModule } from "@/core/modules/types";
import { administrationModule } from "@/modules/administration";
import { bookingsModule } from "@/modules/bookings";
import { catalogModule } from "@/modules/catalog";
import { companyModule } from "@/modules/company";
import { contactsModule } from "@/modules/contacts";
import { customersModule } from "@/modules/customers";
import { inventoryModule } from "@/modules/inventory";
import { itinerariesModule } from "@/modules/itineraries";
import { leadsModule } from "@/modules/leads";
import { partnersModule } from "@/modules/partners";
import { paymentsModule } from "@/modules/payments";
import { currenciesModule } from "@/modules/currencies";
import { pricingModule } from "@/modules/pricing";
import { reportsModule } from "@/modules/reports";
import { tasksModule } from "@/modules/tasks";
import { usersModule } from "@/modules/users";

/** Modules available in the Admin portal, in navigation order. Add new modules here as they are built. */
const modules: AppModule[] = [leadsModule, customersModule, contactsModule, itinerariesModule, tasksModule, catalogModule, inventoryModule, pricingModule, currenciesModule, bookingsModule, paymentsModule, partnersModule, reportsModule, usersModule, administrationModule, companyModule];

const slices = portalSlices(modules, "admin");
export const adminNav = slices.flatMap((s) => s.nav ?? []);
export const adminRoutes = slices.flatMap((s) => s.routes);
