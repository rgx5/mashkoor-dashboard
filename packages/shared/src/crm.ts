import { z } from "zod";
import { LEAD_STAGES, PRODUCT_TYPES, TRIP_TYPES, type LeadStage, type ProductType, type TripType } from "./constants";
import { listQuerySchema } from "./pagination";
import { normalizePhone } from "./phone";
import { patchOf } from "./patch";

// ─── Enums & labels ─────────────────────────────────────────────────────────

export const CUSTOMER_TYPES = ["INDIVIDUAL", "FAMILY", "GROUP", "CORPORATE"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const LEAD_SOURCES = ["WEBSITE", "WHATSAPP", "INSTAGRAM", "PHONE", "WALK_IN", "REFERRAL", "B2B", "B2C_PORTAL", "OTHER"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_PRIORITIES = ["HOT", "WARM", "COLD"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LOST_REASONS = ["PRICE", "DATES_CHANGED", "BOOKED_ELSEWHERE", "NOT_REACHABLE", "NOT_SERIOUS", "OTHER"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const ACTIVITY_TYPES = ["NOTE", "CALL", "WHATSAPP", "EMAIL", "MEETING", "STAGE_CHANGE", "STATUS_CHANGE", "SYSTEM"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
/** Activity types a person can log by hand (the rest are written by the system). */
export const MANUAL_ACTIVITY_TYPES = ["NOTE", "CALL", "WHATSAPP", "EMAIL", "MEETING"] as const;

export const ACTIVITY_ENTITY_TYPES = ["LEAD", "CUSTOMER"] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export const TASK_STATUSES = ["OPEN", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TRAVELER_RELATIONS = ["SELF", "SPOUSE", "CHILD", "PARENT", "SIBLING", "MAHRAM", "OTHER"] as const;
export const GENDERS = ["MALE", "FEMALE"] as const;

export const CONTACT_CHANNELS = ["WHATSAPP", "CALL", "EMAIL"] as const;

/** Stages where a lead is still being worked. */
export const OPEN_LEAD_STAGES = ["NEW", "CONTACTED", "QUOTATION", "WAITING_PAYMENT"] as const satisfies readonly LeadStage[];
/** Board columns in order . */
export const BOARD_STAGES = [...OPEN_LEAD_STAGES, "WON", "LOST"] as const satisfies readonly LeadStage[];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New lead",
  CONTACTED: "Requirements taken",
  QUOTATION: "Quotation sent",
  WAITING_PAYMENT: "Awaiting payment",
  WON: "Won",
  LOST: "Lost",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: "Website",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  B2B: "B2B partner",
  B2C_PORTAL: "Customer portal",
  OTHER: "Other",
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  HOLIDAY: "Holiday",
  VISA: "Visa",
  FLIGHT: "Flight",
  HOTEL: "Hotel",
  PACKAGE: "Package",
  OTHER: "Other",
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRICE: "Price too high",
  DATES_CHANGED: "Dates changed / postponed",
  BOOKED_ELSEWHERE: "Booked elsewhere",
  NOT_REACHABLE: "Not reachable",
  NOT_SERIOUS: "Not a serious enquiry",
  OTHER: "Other",
};

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  INDIVIDUAL: "Individual",
  FAMILY: "Family",
  GROUP: "Group",
  CORPORATE: "Corporate",
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  NOTE: "Note",
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MEETING: "Meeting",
  STAGE_CHANGE: "Stage change",
  STATUS_CHANGE: "Status change",
  SYSTEM: "System",
};

export const TRAVELER_RELATION_LABELS: Record<(typeof TRAVELER_RELATIONS)[number], string> = {
  SELF: "Self",
  SPOUSE: "Spouse",
  CHILD: "Child",
  PARENT: "Parent",
  SIBLING: "Sibling",
  MAHRAM: "Mahram",
  OTHER: "Other",
};

// ─── Field helpers ──────────────────────────────────────────────────────────

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.email("Enter a valid email address").nullable());

/** Required, valid email — trimmed and lowercased. */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

/** Optional email: blank becomes null, otherwise must be valid. Shared across modules that need it. */
export const optionalEmailField = optionalEmail;

export const phoneField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid mobile number" });
      return z.NEVER;
    }
    return normalized;
  });

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid mobile number" });
      return z.NEVER;
    }
    return normalized;
  });

/** `YYYY-MM-DD` or empty. */
const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.iso.date("Enter a valid date").nullable());

const optionalDateTime = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.iso.datetime({ offset: true, message: "Enter a valid date and time" }).nullable());

const count = z.coerce.number().int().min(0).max(999);
const uuid = z.uuid();

// ─── Customers ──────────────────────────────────────────────────────────────

export const customerInputSchema = z.object({
  type: z.enum(CUSTOMER_TYPES).default("INDIVIDUAL"),
  fullName: z.string().trim().min(2, "Enter the customer's name").max(160),
  phone: phoneField,
  altPhone: optionalPhone,
  email: optionalEmail,
  whatsappOptIn: z.boolean().default(true),
  preferredChannel: z.enum(CONTACT_CHANNELS).default("WHATSAPP"),
  city: optionalText(80),
  state: optionalText(80),
  country: z.string().trim().max(2).default("IN"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  source: z.enum(LEAD_SOURCES).default("OTHER"),
  ownerId: uuid.nullable().optional(),
  notes: optionalText(4000),
});
export type CustomerInput = z.input<typeof customerInputSchema>;
export type CustomerData = z.output<typeof customerInputSchema>;

export const customerUpdateSchema = patchOf(customerInputSchema);
export type CustomerUpdateData = z.output<typeof customerUpdateSchema>;

export const customerListQuerySchema = listQuerySchema.extend({
  type: z.enum(CUSTOMER_TYPES).optional(),
  ownerId: uuid.optional(),
  tag: z.string().max(40).optional(),
});
export type CustomerListQuery = z.output<typeof customerListQuerySchema>;

export const mergeCustomersSchema = z.object({ duplicateId: uuid });

export const travelerInputSchema = z.object({
  title: optionalText(10),
  firstName: z.string().trim().min(1, "Enter a first name").max(80),
  lastName: optionalText(80),
  gender: z.enum(GENDERS).nullable().optional(),
  dob: optionalDate,
  nationality: z.string().trim().max(2).default("IN"),
  relation: z.enum(TRAVELER_RELATIONS).default("SELF"),
  passportNo: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^[A-Z0-9]{6,12}$/, "Enter a valid passport number").nullable()),
  passportExpiry: optionalDate,
  passportIssuePlace: optionalText(80),
  mealPreference: optionalText(40),
  specialNeeds: optionalText(500),
});
export type TravelerInput = z.input<typeof travelerInputSchema>;
export type TravelerData = z.output<typeof travelerInputSchema>;

// ─── Leads ──────────────────────────────────────────────────────────────────

export const leadRequirementFields = {
  productType: z.enum(PRODUCT_TYPES).default("OTHER"),
  /** How the trip would be run — FIT, a group tour, or a custom private plan. Separate from productType. */
  tripType: z.enum(TRIP_TYPES).default("FIT"),
  destination: optionalText(160),
  travelFrom: optionalDate,
  travelTo: optionalDate,
  flexibleDates: z.boolean().default(false),
  adults: count.default(1),
  children: count.default(0),
  infants: count.default(0),
  /** What the customer said they can spend. */
  budgetMin: z.coerce.number().int().min(0).nullable().optional(),
  budgetMax: z.coerce.number().int().min(0).nullable().optional(),
  /** What we told them, verbally, before any formal itinerary exists. */
  quotedAmount: z.coerce.number().int().min(0).nullable().optional(),
  requirements: optionalText(4000),
};

export const leadInputSchema = z
  .object({
    customerId: uuid.nullable().optional(),
    contactName: z.string().trim().min(2, "Enter a contact name").max(160),
    phone: phoneField,
    email: optionalEmail,
    source: z.enum(LEAD_SOURCES).default("PHONE"),
    sourceDetail: optionalText(160),
    priority: z.enum(LEAD_PRIORITIES).default("WARM"),
    ownerId: uuid.nullable().optional(),
    nextFollowUpAt: optionalDateTime,
    ...leadRequirementFields,
  })
  .refine((v) => !v.travelFrom || !v.travelTo || v.travelTo >= v.travelFrom, { path: ["travelTo"], message: "Return must be after departure" })
  .refine((v) => v.budgetMin == null || v.budgetMax == null || v.budgetMax >= v.budgetMin, { path: ["budgetMax"], message: "Maximum must be above minimum" });
export type LeadInput = z.input<typeof leadInputSchema>;
export type LeadData = z.output<typeof leadInputSchema>;

export const leadUpdateSchema = patchOf(
  z.object({
    contactName: z.string().trim().min(2).max(160),
    phone: phoneField,
    email: optionalEmail,
    source: z.enum(LEAD_SOURCES),
    sourceDetail: optionalText(160),
    priority: z.enum(LEAD_PRIORITIES),
    nextFollowUpAt: optionalDateTime,
    productType: leadRequirementFields.productType,
    tripType: leadRequirementFields.tripType,
    destination: leadRequirementFields.destination,
    travelFrom: leadRequirementFields.travelFrom,
    travelTo: leadRequirementFields.travelTo,
    flexibleDates: z.boolean(),
    adults: count,
    children: count,
    infants: count,
    budgetMin: leadRequirementFields.budgetMin,
    budgetMax: leadRequirementFields.budgetMax,
    quotedAmount: leadRequirementFields.quotedAmount,
    requirements: leadRequirementFields.requirements,
  }),
);
export type LeadUpdateData = z.output<typeof leadUpdateSchema>;

export const leadStageChangeSchema = z
  .object({
    stage: z.enum(LEAD_STAGES),
    lostReason: z.enum(LOST_REASONS).nullable().optional(),
    note: optionalText(2000),
  })
  .refine((v) => v.stage !== "LOST" || Boolean(v.lostReason), { path: ["lostReason"], message: "Choose why the lead was lost" });
export type LeadStageChange = z.output<typeof leadStageChangeSchema>;

export const leadAssignSchema = z.object({ ownerId: uuid.nullable() });

/** Super admin hands a lead that is ready for payment to an accountant (null takes it back). */
export const leadAccountantSchema = z.object({ accountantId: uuid.nullable() });

export const leadBulkSchema = z.object({
  ids: z.array(uuid).min(1).max(200),
  ownerId: uuid.nullable().optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
});

export const leadConvertSchema = z.object({
  /** Link to an existing customer; omit to create one from the lead's contact details. */
  customerId: uuid.optional(),
});

export const leadListQuerySchema = listQuerySchema.extend({
  stage: z.enum(LEAD_STAGES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  tripType: z.enum(TRIP_TYPES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  /** `me`, `unassigned` or a user id */
  owner: z.string().max(40).optional(),
  followUp: z.enum(["overdue", "today", "week"]).optional(),
  customerId: uuid.optional(),
});
export type LeadListQuery = z.output<typeof leadListQuerySchema>;

/**
 * The website's own trip-type picker still offers "Hajj" and "Umrah" as marketing categories (that's the agency's
 * core business) even though those aren't a `ProductType` in the CRM any more. Accept them here and fold them into
 * a valid product type, keeping the actual word in `requirements` so staff still see exactly what was asked for.
 */
const publicProductTypeSchema = z.enum([...PRODUCT_TYPES, "HAJJ", "UMRAH"] as const);

/** Public website enquiry (PROJECT_PLAN §10.2) — mirrors the website's server action payload. */
export const publicEnquirySchema = z
  .object({
  formType: z.enum(["GENERAL", "CONTACT", "PACKAGE", "DESTINATION", "SERVICE", "CUSTOM_TRIP"]),
  contactName: z.string().trim().min(2).max(160),
  phone: phoneField,
  whatsapp: optionalPhone,
  email: optionalEmail,
  productType: publicProductTypeSchema.optional().default("OTHER"),
  destination: optionalText(160),
  packageSlug: optionalText(160),
  serviceSlug: optionalText(80),
  travelFrom: optionalDate,
  travelTo: optionalDate,
  travelMonth: optionalText(20),
  adults: count.optional(),
  children: count.optional(),
  infants: count.optional(),
  budget: optionalText(60),
  servicesRequired: z.array(z.string().max(30)).max(10).default([]),
  requirements: optionalText(2000),
  preferredContact: z.enum(CONTACT_CHANNELS).default("WHATSAPP"),
  consent: z.object({ given: z.literal(true), text: z.string().max(60), at: z.string().max(40) }),
  attribution: z
    .object({
      pagePath: optionalText(300),
      referrer: optionalText(500),
      utmSource: optionalText(100),
      utmMedium: optionalText(100),
      utmCampaign: optionalText(100),
      utmTerm: optionalText(100),
      utmContent: optionalText(100),
    })
    .partial()
    .default({}),
  // Trimmed rather than rejected: a long browser user-agent must never cost us a real enquiry.
  client: z
    .object({
      ip: z.string().transform((s) => s.slice(0, 64)).nullable().optional(),
      userAgent: z.string().transform((s) => s.slice(0, 400)).nullable().optional(),
    })
    .partial()
    .optional(),
  })
  .transform((v) => {
    if (v.productType !== "HAJJ" && v.productType !== "UMRAH") return { ...v, productType: v.productType };
    const label = v.productType === "HAJJ" ? "Hajj" : "Umrah";
    return { ...v, productType: "PACKAGE" as ProductType, requirements: v.requirements ? `[${label}] ${v.requirements}` : `[${label} enquiry]` };
  });
export type PublicEnquiry = z.output<typeof publicEnquirySchema>;

// ─── Activities & tasks ─────────────────────────────────────────────────────

export const activityInputSchema = z.object({
  entityType: z.enum(ACTIVITY_ENTITY_TYPES),
  entityId: uuid,
  type: z.enum(MANUAL_ACTIVITY_TYPES),
  body: z.string().trim().min(1, "Write something").max(4000),
});
export type ActivityInput = z.output<typeof activityInputSchema>;

export const activityListQuerySchema = z.object({
  entityType: z.enum(ACTIVITY_ENTITY_TYPES),
  entityId: uuid,
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const taskInputSchema = z.object({
  title: z.string().trim().min(2, "Enter a task title").max(200),
  description: optionalText(2000),
  dueAt: z.iso.datetime({ offset: true, message: "Choose a due date" }),
  assigneeId: uuid.optional(),
  leadId: uuid.nullable().optional(),
  customerId: uuid.nullable().optional(),
  priority: z.enum(LEAD_PRIORITIES).default("WARM"),
});
export type TaskInput = z.input<typeof taskInputSchema>;
export type TaskData = z.output<typeof taskInputSchema>;

export const taskUpdateSchema = patchOf(
  z.object({
    title: z.string().trim().min(2).max(200),
    description: optionalText(2000),
    dueAt: z.iso.datetime({ offset: true }),
    assigneeId: uuid,
    priority: z.enum(LEAD_PRIORITIES),
    status: z.enum(TASK_STATUSES),
  }),
);
export type TaskUpdateData = z.output<typeof taskUpdateSchema>;

export const taskListQuerySchema = z.object({
  due: z.enum(["overdue", "today", "upcoming", "all"]).default("all"),
  status: z.enum(TASK_STATUSES).default("OPEN"),
  assignee: z.string().max(40).default("me"),
  leadId: uuid.optional(),
  customerId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type TaskListQuery = z.output<typeof taskListQuerySchema>;

// ─── Response shapes ────────────────────────────────────────────────────────

export interface UserRef {
  id: string;
  name: string;
}

export interface CustomerRow {
  id: string;
  refNo: string;
  type: CustomerType;
  fullName: string;
  phone: string;
  email: string | null;
  city: string | null;
  tags: string[];
  source: LeadSource;
  owner: UserRef | null;
  openLeads: number;
  createdAt: string;
}

export interface Traveler {
  id: string;
  customerId: string;
  title: string | null;
  firstName: string;
  lastName: string | null;
  gender: (typeof GENDERS)[number] | null;
  dob: string | null;
  nationality: string;
  relation: (typeof TRAVELER_RELATIONS)[number];
  /** Masked unless the caller asked to reveal it (and is allowed to). */
  passportNo: string | null;
  passportExpiry: string | null;
  passportIssuePlace: string | null;
  mealPreference: string | null;
  specialNeeds: string | null;
}

export interface CustomerDetail extends CustomerRow {
  altPhone: string | null;
  whatsappOptIn: boolean;
  preferredChannel: (typeof CONTACT_CHANNELS)[number];
  state: string | null;
  country: string;
  notes: string | null;
  travelers: Traveler[];
  updatedAt: string;
}

export interface LeadRow {
  id: string;
  refNo: string;
  contactName: string;
  phone: string;
  email: string | null;
  customer: { id: string; refNo: string; fullName: string } | null;
  source: LeadSource;
  sourceDetail: string | null;
  productType: ProductType;
  tripType: TripType;
  destination: string | null;
  travelFrom: string | null;
  travelTo: string | null;
  adults: number;
  children: number;
  infants: number;
  stage: LeadStage;
  priority: LeadPriority;
  owner: UserRef | null;
  /** The accountant handling payment; the owner keeps read-only access once this is set. */
  accountant: UserRef | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  stageChangedAt: string;
  createdAt: string;
}

export interface LeadDetail extends LeadRow {
  flexibleDates: boolean;
  budgetMin: number | null;
  budgetMax: number | null;
  quotedAmount: number | null;
  requirements: string | null;
  lostReason: LostReason | null;
  attribution: Record<string, string | null> | null;
  /** The raw enquiry this lead came from (that record is deleted once converted). */
  enquiryRef: string | null;
  accountantAssignedAt: string | null;
  /** Latest quotation, booking and invoice, so the page can offer the next step. */
  quotation: { id: string; refNo: string; status: string } | null;
  booking: { id: string; refNo: string } | null;
  invoice: { id: string; refNo: string } | null;
  updatedAt: string;
}

export interface Activity {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  type: ActivityType;
  body: string;
  meta: Record<string, unknown> | null;
  createdBy: UserRef | null;
  createdAt: string;
  /** Present on customer timelines so entries can link to the lead they came from. */
  lead?: { id: string; refNo: string } | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  status: TaskStatus;
  priority: LeadPriority;
  assignee: UserRef;
  lead: { id: string; refNo: string; contactName: string } | null;
  customer: { id: string; refNo: string; fullName: string } | null;
  completedAt: string | null;
  createdAt: string;
}

export type LeadBoard = Record<(typeof BOARD_STAGES)[number], { total: number; leads: LeadRow[] }>;
