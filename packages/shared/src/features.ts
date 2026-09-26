/**
 * Switchable areas of the platform. The CRM core — leads, customers, contacts, tasks, activity timelines, users,
 * company profile, audit log, email log, CSV import, dashboard and search — is always on.
 *
 * Production can ship only what the client is using today by listing what to turn on in `ENABLED_FEATURES`
 * (the API reads it; the dashboard learns it from `GET /api/v1/public/features`). Everything else answers 404 and is
 * hidden from the navigation, but stays in the code and can be switched on later without a release.
 */
export const FEATURE_NAMES = ["quotations", "bookings", "payments", "b2b", "website", "portal"] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export const FEATURE_LABELS: Record<FeatureName, string> = {
  quotations: "Itineraries & quotations (share link, PDF)",
  bookings: "Bookings, inventory, pricing rules, trip documents",
  payments: "Payments, payment links and receipts",
  b2b: "B2B partners, wallet and the partner portal",
  website: "Website content (packages, destinations, testimonials) and public booking",
  portal: "Customer portal (/b2c)",
};

/** Features that are meaningless without another one being on. */
export const FEATURE_REQUIRES: Partial<Record<FeatureName, readonly FeatureName[]>> = {
  payments: ["bookings"],
  b2b: ["bookings"],
};

export interface ParsedFeatures {
  features: FeatureName[];
  /** Problems worth failing start-up for: unknown names and missing dependencies. */
  errors: string[];
}

/** `all` (or empty) turns everything on; otherwise a comma-separated list such as `quotations,portal`. `none` = CRM core only. */
export function parseFeatures(value: string | null | undefined): ParsedFeatures {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "" || text === "all") return { features: [...FEATURE_NAMES], errors: [] };
  if (text === "none") return { features: [], errors: [] };

  const errors: string[] = [];
  const features = new Set<FeatureName>();
  for (const raw of text.split(",")) {
    const name = raw.trim();
    if (!name) continue;
    if ((FEATURE_NAMES as readonly string[]).includes(name)) features.add(name as FeatureName);
    else errors.push(`unknown feature "${name}" (choose from: ${FEATURE_NAMES.join(", ")}, or "all" / "none")`);
  }
  for (const feature of features) {
    for (const needed of FEATURE_REQUIRES[feature] ?? []) {
      if (!features.has(needed)) errors.push(`"${feature}" needs "${needed}" to be enabled too`);
    }
  }
  return { features: FEATURE_NAMES.filter((f) => features.has(f)), errors };
}

/** True when every feature in `needed` is on. */
export const hasFeatures = (enabled: readonly FeatureName[], needed: readonly FeatureName[]) => needed.every((f) => enabled.includes(f));

export interface PublicFeatures {
  features: FeatureName[];
}
