/** Portals at the root of the app — mirrored by API roots /api/v1/{admin|b2b|b2c}. */
export const PORTALS = ["admin", "b2b", "b2c"] as const;
export type Portal = (typeof PORTALS)[number];

export const USER_TYPES = ["STAFF", "PARTNER", "CUSTOMER"] as const;
export type UserType = (typeof USER_TYPES)[number];

export const ROLES = ["SUPER_ADMIN", "OPS_MANAGER", "SALES_AGENT", "ACCOUNTS", "VISA_DOCS", "SUPPORT", "CONTENT", "PARTNER_ADMIN", "PARTNER_USER", "CUSTOMER"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["INVITED", "ACTIVE", "DISABLED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Which user type may sign in to which portal. */
export const PORTAL_USER_TYPE: Record<Portal, UserType> = {
  admin: "STAFF",
  b2b: "PARTNER",
  b2c: "CUSTOMER",
};

/** What each staff role is for, shown when inviting or editing a user. The real permissions live in the backend's ability factory. */
export const ROLE_DESCRIPTIONS: Partial<Record<Role, string>> = {
  SUPER_ADMIN: "Everything, including users, company profile, audit log and settings.",
  OPS_MANAGER: "Runs day-to-day operations: leads, customers, bookings, inventory, pricing, partners, catalog and all reports.",
  SALES_AGENT: "Works their own leads, customers, quotations and bookings. Cannot see cost or margin.",
  ACCOUNTS: "Records and verifies payments, issues payment links, manages partner wallets, and sees receivables and money reports. Cannot edit bookings, leads or catalog.",
  VISA_DOCS: "Uploads visas, tickets and vouchers to bookings, manages traveller and passport details, and notifies customers. Can see bookings read-only; cannot handle payments or see cost.",
  SUPPORT: "Answers customers and agents: sees customers, leads and bookings read-only, posts trip updates and logs notes. Cannot handle payments or see cost.",
  CONTENT: "Edits website content only: packages, departures, destinations, testimonials and FAQs. No customer or booking data.",
};

export const STAFF_ROLES = ["SUPER_ADMIN", "OPS_MANAGER", "SALES_AGENT", "ACCOUNTS", "VISA_DOCS", "SUPPORT", "CONTENT"] as const satisfies readonly Role[];
export const PARTNER_ROLES = ["PARTNER_ADMIN", "PARTNER_USER"] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  OPS_MANAGER: "Operations Manager",
  SALES_AGENT: "Sales / Booking Agent",
  ACCOUNTS: "Accounts / Finance",
  VISA_DOCS: "Visa / Documentation",
  SUPPORT: "Customer Support",
  CONTENT: "Content / Marketing",
  PARTNER_ADMIN: "Partner Admin",
  PARTNER_USER: "Partner User",
  CUSTOMER: "Customer",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  DISABLED: "Disabled",
};

/** Product types used across leads, packages and bookings (PROJECT_PLAN §7.4). */
export const PRODUCT_TYPES = ["HOLIDAY", "VISA", "FLIGHT", "HOTEL", "PACKAGE", "OTHER"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/**
 * How a trip is run — separate from ProductType (what kind of travel product it is). A Holiday or a Package can be
 * FIT, a fixed-departure group, or a bespoke private plan; this says which, independent of the product itself.
 */
export const TRIP_TYPES = ["FIT", "GROUP_TOUR", "CUSTOMIZED"] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  FIT: "FIT (independent)",
  GROUP_TOUR: "Group tour",
  CUSTOMIZED: "Customized",
};

export const LEAD_STAGES = [
  "NEW",
  "CONTACTED",
  "QUOTATION",
  "WAITING_PAYMENT",
  "WON",
  "LOST",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const BOOKING_STATUSES = [
  "INQUIRY",
  "QUOTE",
  "PENDING_PAYMENT",
  "PENDING_APPROVAL",
  "IN_PROGRESS",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  INQUIRY: "Inquiry",
  QUOTE: "Quote sent",
  PENDING_PAYMENT: "Pending payment",
  PENDING_APPROVAL: "Pending approval",
  IN_PROGRESS: "In progress",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

/** Allowed forward/side moves from each status (bookings.service.ts enforces this). Cancellation is always offered separately. */
export const BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  INQUIRY: ["QUOTE", "CANCELLED"],
  QUOTE: ["PENDING_PAYMENT", "INQUIRY", "CANCELLED"],
  PENDING_PAYMENT: ["PENDING_APPROVAL", "IN_PROGRESS", "CANCELLED", "FAILED"],
  PENDING_APPROVAL: ["IN_PROGRESS", "CANCELLED", "FAILED"],
  IN_PROGRESS: ["CONFIRMED", "CANCELLED", "FAILED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: ["INQUIRY"],
};

export const BOOKING_ITEM_TYPES = ["FLIGHT", "HOTEL", "PACKAGE", "VISA", "TICKETING", "OTHER"] as const;
export type BookingItemType = (typeof BOOKING_ITEM_TYPES)[number];
export const BOOKING_ITEM_TYPE_LABELS: Record<BookingItemType, string> = {
  FLIGHT: "Flight",
  HOTEL: "Hotel",
  PACKAGE: "Package",
  VISA: "Visa",
  TICKETING: "Ticketing",
  OTHER: "Other",
};

export const MEAL_PLANS = ["ROOM_ONLY", "BREAKFAST", "HALF_BOARD", "FULL_BOARD", "ALL_INCLUSIVE"] as const;
export type MealPlan = (typeof MEAL_PLANS)[number];
export const MEAL_PLAN_LABELS: Record<MealPlan, string> = {
  ROOM_ONLY: "Room only",
  BREAKFAST: "Breakfast",
  HALF_BOARD: "Half board",
  FULL_BOARD: "Full board",
  ALL_INCLUSIVE: "All inclusive",
};

export const CABIN_CLASSES = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] as const;
export type CabinClass = (typeof CABIN_CLASSES)[number];
export const CABIN_CLASS_LABELS: Record<CabinClass, string> = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium economy",
  BUSINESS: "Business",
  FIRST: "First",
};

export const PRICING_SCOPES = ["B2C", "B2B"] as const;
export type PricingScope = (typeof PRICING_SCOPES)[number];

export const PRICING_ADJUSTMENT_TYPES = ["PERCENT_MARKUP", "FIXED_MARKUP", "FIXED_PRICE"] as const;
export type PricingAdjustmentType = (typeof PRICING_ADJUSTMENT_TYPES)[number];
export const PRICING_ADJUSTMENT_TYPE_LABELS: Record<PricingAdjustmentType, string> = {
  PERCENT_MARKUP: "Markup %",
  FIXED_MARKUP: "Markup ₹",
  FIXED_PRICE: "Fixed sell price",
};
