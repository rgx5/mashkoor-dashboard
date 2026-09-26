import { Luggage } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { useBookings } from "./api";
export { NewBookingDialog } from "./admin/NewBookingDialog";

/** M07 · Bookings — register, wizard, status workflow. Admin + B2B (submit, track) + B2C (my trips) slices. */
export const bookingsModule: AppModule = {
  id: "bookings",
  admin: {
    nav: [{ label: "Bookings", to: "bookings", icon: Luggage, can: ["read", "Booking"], group: "Operations" }],
    routes: [
      { path: "bookings", lazy: async () => ({ Component: (await import("./admin/BookingsPage")).BookingsPage }) },
      { path: "bookings/:id", lazy: async () => ({ Component: (await import("./admin/BookingDetailPage")).BookingDetailPage }) },
    ],
  },
  b2b: {
    nav: [{ label: "Bookings", to: "bookings", icon: Luggage }],
    routes: [
      { path: "bookings", lazy: async () => ({ Component: (await import("./b2b/B2BBookingsPage")).B2BBookingsPage }) },
      { path: "bookings/:id", lazy: async () => ({ Component: (await import("./b2b/B2BBookingDetailPage")).B2BBookingDetailPage }) },
    ],
  },
  b2c: {
    nav: [{ label: "Trips", to: "trips", icon: Luggage }],
    routes: [
      { path: "trips", lazy: async () => ({ Component: (await import("./b2c/B2CTripsPage")).B2CTripsPage }) },
      { path: "trips/:id", lazy: async () => ({ Component: (await import("./b2c/B2CTripDetailPage")).B2CTripDetailPage }) },
    ],
  },
};
