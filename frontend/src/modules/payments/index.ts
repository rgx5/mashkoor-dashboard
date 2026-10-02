import { CreditCard } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { BookingPaymentsPanel, RecordPaymentDialog } from "./BookingPaymentsPanel";
export { useRejectPayment, useVerifyPayment } from "./api";

/** M11 · Payments — offline collections register (no gateway wired up yet). */
export const paymentsModule: AppModule = {
  id: "payments",
  admin: {
    nav: [{ label: "Payments", to: "payments", icon: CreditCard, can: ["collect", "Booking"], feature: "payments", group: "Operations" }],
    routes: [{ path: "payments", lazy: async () => ({ Component: (await import("./admin/PaymentsPage")).PaymentsPage }) }],
  },
};
