import { Globe2, HelpCircle, Luggage, MessageSquareQuote } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { usePackages } from "./api";

/** M04 · Catalog — destinations, packages, testimonials, FAQs. Content editors for the website. */
export const catalogModule: AppModule = {
  id: "catalog",
  admin: {
    nav: [
      { label: "Destinations", to: "destinations", icon: Globe2, can: ["read", "Destination"], group: "Catalog" },
      { label: "Packages", to: "packages", icon: Luggage, can: ["read", "Package"], group: "Catalog" },
      { label: "Testimonials", to: "testimonials", icon: MessageSquareQuote, can: ["read", "Testimonial"], group: "Catalog" },
      { label: "FAQs", to: "faqs", icon: HelpCircle, can: ["read", "Faq"], group: "Catalog" },
    ],
    routes: [
      { path: "destinations", lazy: async () => ({ Component: (await import("./admin/DestinationsPage")).DestinationsPage }) },
      { path: "packages", lazy: async () => ({ Component: (await import("./admin/PackagesPage")).PackagesPage }) },
      { path: "testimonials", lazy: async () => ({ Component: (await import("./admin/TestimonialsPage")).TestimonialsPage }) },
      { path: "faqs", lazy: async () => ({ Component: (await import("./admin/FaqsPage")).FaqsPage }) },
    ],
  },
};
