import { z } from "zod";
import { LEAD_PRIORITIES, LEAD_SOURCES, leadRequirementFields, optionalEmailField, optionalText, phoneField, type LeadSource, type UserRef } from "./crm";
import { listQuerySchema } from "./pagination";
import { patchOf } from "./patch";

const uuid = z.uuid();

export const ENQUIRY_STATUSES = ["NEW", "CONTACTED"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
};

/** A raw enquiry: who they are and how to reach them. Requirements are collected later, on the call. */
export const enquiryInputSchema = z.object({
  contactName: z.string().trim().min(2, "Enter a name").max(160),
  phone: phoneField,
  email: optionalEmailField,
  source: z.enum(LEAD_SOURCES).default("PHONE"),
  sourceDetail: optionalText(160),
  message: optionalText(2000),
  ownerId: uuid.nullable().optional(),
});
export type EnquiryInput = z.input<typeof enquiryInputSchema>;
export type EnquiryData = z.output<typeof enquiryInputSchema>;

export const enquiryUpdateSchema = patchOf(
  z.object({
    contactName: z.string().trim().min(2).max(160),
    phone: phoneField,
    email: optionalEmailField,
    notes: optionalText(4000),
  }),
);
export type EnquiryUpdateData = z.output<typeof enquiryUpdateSchema>;

export const enquiryAssignSchema = z.object({ ownerId: uuid.nullable() });

export const enquiryStatusSchema = z.object({
  status: z.enum(ENQUIRY_STATUSES),
  /** What happened on the call — added to the enquiry's notes. */
  note: optionalText(2000),
});
export type EnquiryStatusChange = z.output<typeof enquiryStatusSchema>;

/** Turning an enquiry into a lead: the rep has talked to them and now has the requirements. */
export const enquiryConvertSchema = z
  .object({
    ...leadRequirementFields,
    requirements: z.string().trim().min(3, "Write down what the customer wants").max(4000),
    priority: z.enum(LEAD_PRIORITIES).default("WARM"),
  })
  .refine((v) => !v.travelFrom || !v.travelTo || v.travelTo >= v.travelFrom, { path: ["travelTo"], message: "Return must be after departure" })
  .refine((v) => v.budgetMin == null || v.budgetMax == null || v.budgetMax >= v.budgetMin, { path: ["budgetMax"], message: "Maximum must be above minimum" });
export type EnquiryConvertInput = z.input<typeof enquiryConvertSchema>;
export type EnquiryConvertData = z.output<typeof enquiryConvertSchema>;

export const enquiryListQuerySchema = listQuerySchema.extend({
  status: z.enum(ENQUIRY_STATUSES).optional(),
  /** `me`, `unassigned` or a user id */
  owner: z.string().max(40).optional(),
});
export type EnquiryListQuery = z.output<typeof enquiryListQuerySchema>;

export interface EnquiryRow {
  id: string;
  refNo: string;
  contactName: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  sourceDetail: string | null;
  message: string | null;
  notes: string | null;
  status: EnquiryStatus;
  owner: UserRef | null;
  assignedAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
}

/** Board columns: not yet assigned, assigned and waiting for a first call, and called. Reps only ever see their own. */
export const ENQUIRY_COLUMNS = ["unassigned", "new", "contacted"] as const;
export type EnquiryColumn = (typeof ENQUIRY_COLUMNS)[number];
export type EnquiryBoard = Record<EnquiryColumn, { total: number; enquiries: EnquiryRow[] }>;

export const ENQUIRY_COLUMN_LABELS: Record<EnquiryColumn, string> = {
  unassigned: "Unassigned",
  new: "New",
  contacted: "Contacted",
};
