import { STAFF_FEATURES, type StaffFeature } from "@mashkoor/shared";

/** The rule shape CASL keeps in `builder.rules` — only the parts that gating needs to look at. */
export interface GateRule {
  action: string | string[];
  subject?: string | string[];
  conditions?: unknown;
  inverted?: boolean;
  [key: string]: unknown;
}

/** Which dashboard area owns each kind of record. Records not listed are never gated (e.g. activity notes). */
const SUBJECT_FEATURE: Record<string, StaffFeature> = {
  Enquiry: "enquiries",
  Lead: "leads",
  Customer: "customers",
  Traveler: "customers",
  Contact: "contacts",
  Itinerary: "quotations",
  Task: "tasks",
  Hotel: "inventory",
  RoomType: "inventory",
  RatePeriod: "inventory",
  FlightSeatBlock: "inventory",
  PricingRule: "pricing",
  Currency: "currencies",
  Booking: "bookings",
  Invoice: "invoices",
  FinanceEntry: "accounts",
  Partner: "partners",
  Destination: "catalog",
  Package: "catalog",
  Testimonial: "catalog",
  Faq: "catalog",
  User: "users",
  Setting: "company",
  InboundEvent: "administration",
  NotificationLog: "administration",
  AuditLog: "administration",
};

/** Money actions live on bookings and wallets but belong to their own areas. */
const ACTION_FEATURE: Record<string, Record<string, StaffFeature>> = {
  Booking: { collect: "payments" },
};

/**
 * Areas that need to *read* another area's records to work — quoting needs the hotels, flights and prices to pick from, an
 * invoice needs the booking behind it. Switching one of these on grants the read-only side of the records it relies on,
 * and nothing more (the sidebar still only shows the areas that were actually switched on).
 */
const READ_NEEDED_BY: Record<string, StaffFeature[]> = {
  Hotel: ["quotations", "bookings"],
  RoomType: ["quotations", "bookings"],
  RatePeriod: ["quotations", "bookings"],
  FlightSeatBlock: ["quotations", "bookings"],
  PricingRule: ["quotations", "bookings"],
  Currency: ["quotations", "bookings", "inventory", "accounts"],
  Customer: ["enquiries", "leads", "quotations", "bookings", "invoices", "accounts", "payments"],
  Traveler: ["bookings", "leads"],
  Lead: ["quotations", "invoices", "bookings"],
  Itinerary: ["bookings", "invoices", "leads"],
  Booking: ["invoices", "accounts", "quotations", "leads"],
  Invoice: ["accounts", "bookings"],
  Partner: ["bookings", "accounts", "leads"],
};

const featureOf = (action: string, subject: string): StaffFeature | null => ACTION_FEATURE[subject]?.[action] ?? SUBJECT_FEATURE[subject] ?? null;

const isSelfOnly = (conditions: unknown, userId: string) => {
  if (!conditions || typeof conditions !== "object") return false;
  const keys = Object.keys(conditions);
  return keys.length === 1 && keys[0] === "id" && (conditions as { id?: unknown }).id === userId;
};

/** What a person may still do with one action on one kind of record, given the areas switched on for them. Null: nothing. */
function gateAction(action: string, subject: string, on: ReadonlySet<StaffFeature>): string | null {
  const owner = featureOf(action, subject);
  if (owner === null || on.has(owner)) return action;
  // Not their area. They may still read it if an area they do have relies on it ("manage" shrinks to "read").
  if ((action === "read" || action === "manage") && READ_NEEDED_BY[subject]?.some((f) => on.has(f))) return "read";
  return null;
}

/**
 * Narrows a staff member's role rules to the areas switched on for them. Rules that forbid things are kept as they are
 * (they only ever take access away), and a person can always read their own user record.
 */
export function gateRules<R extends GateRule>(rules: R[], userId: string, features: readonly string[]): R[] {
  const on = new Set(features.filter((f): f is StaffFeature => (STAFF_FEATURES as readonly string[]).includes(f)));
  const kept: R[] = [];
  for (const rule of rules) {
    if (rule.inverted || rule.subject === undefined) {
      kept.push(rule);
      continue;
    }
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    for (const subject of subjects) {
      const allowed = new Set<string>();
      for (const action of actions) {
        if (subject === "User" && action === "read" && isSelfOnly(rule.conditions, userId)) allowed.add(action);
        else if (subject === "all") allowed.add(action);
        else {
          const result = gateAction(action, subject, on);
          if (result) allowed.add(result);
        }
      }
      if (allowed.size > 0) kept.push({ ...rule, subject, action: [...allowed] });
    }
  }
  // A role that may manage bookings can collect payments too; without the payments area it can't.
  if (!on.has("payments")) kept.push({ action: "collect", subject: "Booking", inverted: true } as unknown as R);
  return kept;
}

/** Every area a rule set touches at all — what a role could use if everything were switched on. */
export function featuresUsedBy(rules: GateRule[], userId: string): StaffFeature[] {
  const used = new Set<StaffFeature>();
  for (const rule of rules) {
    if (rule.inverted || rule.subject === undefined) continue;
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    for (const subject of subjects) {
      for (const action of actions) {
        if (subject === "User" && action === "read" && isSelfOnly(rule.conditions, userId)) continue;
        const owner = featureOf(action === "manage" ? "read" : action, subject);
        if (owner) used.add(owner);
        // "manage" on Booking also covers collecting payments.
        if (action === "manage" && subject === "Booking") used.add("payments");
      }
    }
  }
  return STAFF_FEATURES.filter((f) => used.has(f));
}
