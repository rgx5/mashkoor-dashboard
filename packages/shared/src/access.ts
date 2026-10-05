import { z } from "zod";

/**
 * The areas of the dashboard a super admin can switch on or off for each staff member. Everyone starts with the dashboard
 * home only; an area adds that part of the system, within what the person's role allows. Super admins always have everything.
 * (Not to be confused with `FEATURE_NAMES`, the deployment-wide switches in features.ts.)
 */
export const STAFF_FEATURES = [
  "enquiries",
  "leads",
  "customers",
  "contacts",
  "quotations",
  "tasks",
  "inventory",
  "pricing",
  "currencies",
  "bookings",
  "payments",
  "invoices",
  "accounts",
  "forex",
  "partners",
  "catalog",
  "users",
  "administration",
  "company",
] as const;
export type StaffFeature = (typeof STAFF_FEATURES)[number];

export const isStaffFeature = (value: string): value is StaffFeature => (STAFF_FEATURES as readonly string[]).includes(value);

export interface StaffFeatureInfo {
  key: StaffFeature;
  label: string;
  group: string;
  description: string;
}

/** What each area covers, grouped the way the sidebar groups it. */
export const STAFF_FEATURE_INFO: Record<StaffFeature, StaffFeatureInfo> = {
  enquiries: { key: "enquiries", label: "Enquiries", group: "CRM", description: "Raw enquiries: assign them, log the first call, convert to leads" },
  leads: { key: "leads", label: "Leads", group: "CRM", description: "The sales pipeline and lead details" },
  customers: { key: "customers", label: "Customers", group: "CRM", description: "Customer records and travellers" },
  contacts: { key: "contacts", label: "Contacts", group: "CRM", description: "The shared contacts directory" },
  quotations: { key: "quotations", label: "Quotations", group: "CRM", description: "Build, share and download quotations" },
  tasks: { key: "tasks", label: "Tasks", group: "CRM", description: "Task lists and reminders" },
  inventory: { key: "inventory", label: "Hotels & flights", group: "Inventory", description: "Hotel rooms, rates and flight seat blocks" },
  pricing: { key: "pricing", label: "Pricing rules", group: "Inventory", description: "Mark-ups for customers and agencies" },
  currencies: { key: "currencies", label: "Currencies", group: "Inventory", description: "Currencies, reference exchange rates and rate history" },
  bookings: { key: "bookings", label: "Bookings", group: "Operations", description: "Bookings, travellers, documents and trip updates" },
  payments: { key: "payments", label: "Payments", group: "Operations", description: "Record and verify payments, payment links" },
  invoices: { key: "invoices", label: "Invoices", group: "Operations", description: "Raise and send invoices" },
  accounts: { key: "accounts", label: "Accounts", group: "Accounts", description: "The ledger, supplier payments and expenses" },
  forex: { key: "forex", label: "Forex desk", group: "Forex", description: "Sell foreign currency to customers, buy stock from dealers, set the buy and sell rates" },
  partners: { key: "partners", label: "Partners", group: "Partners", description: "Agencies, KYC review and wallets" },
  catalog: { key: "catalog", label: "Website catalog", group: "Catalog", description: "Destinations, packages, testimonials and FAQs" },
  users: { key: "users", label: "Staff users", group: "Administration", description: "Invite and manage staff" },
  administration: { key: "administration", label: "System logs & import", group: "Administration", description: "Inbound events, email log, audit log, data import" },
  company: { key: "company", label: "Company profile", group: "Administration", description: "Company details used on documents" },
};

export const staffAccessSchema = z.object({
  features: z
    .array(z.enum(STAFF_FEATURES))
    .max(STAFF_FEATURES.length)
    .transform((list) => [...new Set(list)]),
});
export type StaffAccessInput = z.input<typeof staffAccessSchema>;
export type StaffAccessData = z.output<typeof staffAccessSchema>;

/** One row of the access matrix. */
export interface StaffAccessRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  /** Super admins have everything and can't be limited. */
  fullAccess: boolean;
  features: StaffFeature[];
  /** The areas this person's role can use at all. Switching on any other area changes nothing. */
  available: StaffFeature[];
}

export interface StaffAccessMatrix {
  features: StaffFeatureInfo[];
  staff: StaffAccessRow[];
}
