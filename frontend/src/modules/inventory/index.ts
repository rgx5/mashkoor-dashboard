import { Building2, Bus, Plane } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useRoomAvailability, useFlightAvailability } from "./api";

/** M05 · Inventory — hotels/room types/rate periods and flight seat blocks. */
export const inventoryModule: AppModule = {
  id: "inventory",
  admin: {
    nav: [
      { label: "Hotels", to: "hotels", icon: Building2, can: ["read", "Hotel"], feature: "inventory", group: "Inventory" },
      { label: "Flights", to: "flight-inventory", icon: Plane, can: ["read", "FlightSeatBlock"], feature: "inventory", group: "Inventory" },
      { label: "Transport", to: "transport-inventory", icon: Bus, can: ["read", "TransportOption"], feature: "inventory", group: "Inventory" },
    ],
    routes: [
      { path: "hotels", lazy: async () => ({ Component: (await import("./admin/HotelsPage")).HotelsPage }) },
      { path: "flight-inventory", lazy: async () => ({ Component: (await import("./admin/FlightInventoryPage")).FlightInventoryPage }) },
      { path: "transport-inventory", lazy: async () => ({ Component: (await import("./admin/TransportPage")).TransportPage }) },
    ],
  },
};
