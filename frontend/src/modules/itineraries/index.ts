import { CalendarRange, Compass } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useDuplicateItinerary, useItineraries } from "./api";

/** M10 · Itineraries — build a day-by-day plan with a price, share it as a link, convert an accepted one into a booking. */
export const itinerariesModule: AppModule = {
  id: "itineraries",
  admin: {
    nav: [{ label: "Quotations", to: "itineraries", icon: CalendarRange, can: ["read", "Itinerary"], feature: "quotations", group: "CRM" }],
    routes: [
      { path: "itineraries", lazy: async () => ({ Component: (await import("./admin/ItinerariesPage")).ItinerariesPage }) },
      { path: "itineraries/new", lazy: async () => ({ Component: (await import("./admin/ItineraryEditorPage")).ItineraryEditorPage }) },
      { path: "itineraries/:id", lazy: async () => ({ Component: (await import("./admin/ItineraryEditorPage")).ItineraryEditorPage }) },
    ],
  },
  b2c: {
    nav: [{ label: "Plans", to: "itineraries", icon: Compass }],
    routes: [{ path: "itineraries", lazy: async () => ({ Component: (await import("./b2c/B2CItinerariesPage")).B2CItinerariesPage }) }],
  },
};
