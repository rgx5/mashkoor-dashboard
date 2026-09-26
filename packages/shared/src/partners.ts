import { z } from "zod";
import { listQuerySchema } from "./pagination";
import { emailField, phoneField } from "./crm";
import { patchOf } from "./patch";

export const PARTNER_STATUSES = ["PENDING", "APPROVED", "SUSPENDED", "REJECTED"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];
export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const kycDocumentSchema = z.object({ name: z.string().trim().min(1).max(120), url: z.string().trim().min(1).max(2000) });
export type KycDocument = z.output<typeof kycDocumentSchema>;

/** Submitted from the website by a prospective agent, or entered directly by an admin. */
export const partnerApplicationSchema = z.object({
  companyName: z.string().trim().min(2, "Enter the company name").max(160),
  contactName: z.string().trim().min(2, "Enter a contact name").max(160),
  phone: phoneField,
  email: emailField,
  city: optionalText(80),
  state: optionalText(80),
  gstNumber: optionalText(20),
  panNumber: optionalText(20),
  notes: optionalText(2000),
});
export type PartnerApplicationInput = z.output<typeof partnerApplicationSchema>;

/**
 * The website's "Become a partner" form posts its own field names (tradeName, gstin, message …). This maps them onto
 * the application above and then validates as usual, so the website never has to know the dashboard's naming.
 * Consent, attribution and client details are accepted and ignored here.
 */
const websitePartnerApplicationSchema = z
  .object({
    tradeName: z.string().trim(),
    contactName: z.string().trim(),
    phone: z.string(),
    email: z.string(),
    city: z.string().nullish(),
    gstin: z.string().nullish(),
    message: z.string().nullish(),
    preferredContact: z.enum(["WHATSAPP", "CALL", "EMAIL"]).nullish(),
  })
  .transform((v, ctx): PartnerApplicationInput => {
    const parsed = partnerApplicationSchema.safeParse({
      companyName: v.tradeName,
      contactName: v.contactName,
      phone: v.phone,
      email: v.email,
      city: v.city ?? undefined,
      gstNumber: v.gstin ?? undefined,
      notes: [v.message, v.preferredContact ? `Prefers contact by ${v.preferredContact.toLowerCase()}.` : ""].filter(Boolean).join("\n") || undefined,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
      return z.NEVER;
    }
    return parsed.data;
  });

/** What `POST /public/partner-applications` accepts: the website's form fields, or the dashboard's own. */
export const publicPartnerApplicationSchema = z.union([partnerApplicationSchema, websitePartnerApplicationSchema]);

export const partnerUpdateSchema = patchOf(
  z.object({
    companyName: z.string().trim().min(2).max(160),
    contactName: z.string().trim().min(2).max(160),
    phone: phoneField,
    email: emailField,
    city: optionalText(80),
    state: optionalText(80),
    gstNumber: optionalText(20),
    panNumber: optionalText(20),
    kycDocuments: z.array(kycDocumentSchema).max(20),
    /** What the agency tells Mashkoor (shown in both portals). Staff-only remarks live in `internalNotes`. */
    notes: optionalText(2000),
    /** Staff-only remarks about the agency — never sent to the B2B portal. */
    internalNotes: optionalText(2000),
    creditLimit: z.coerce.number().int().min(0),
  }),
);
export type PartnerUpdateData = z.output<typeof partnerUpdateSchema>;

export const partnerRejectSchema = z.object({ reason: z.string().trim().min(2, "Say why this application was rejected").max(2000) });
export const partnerSuspendSchema = z.object({ reason: z.string().trim().min(2, "Say why this partner is being suspended").max(2000) });
export const partnerInviteAdminSchema = z.object({ name: z.string().trim().min(2, "Enter their name").max(160), email: emailField });

export const partnerListQuerySchema = listQuerySchema.extend({ status: z.enum(PARTNER_STATUSES).optional() });
export type PartnerListQuery = z.output<typeof partnerListQuerySchema>;

export interface PartnerRow {
  id: string;
  refNo: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  city: string | null;
  status: PartnerStatus;
  userCount: number;
  createdAt: string;
}

export interface PartnerDetail extends PartnerRow {
  state: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  kycDocuments: KycDocument[];
  /** What the agency tells Mashkoor (visible in both portals). */
  notes: string | null;
  /** Staff-only; always null in the B2B portal. */
  internalNotes: string | null;
  /** Staff-only (why the agency was rejected or suspended); always null in the B2B portal. */
  rejectedReason: string | null;
  creditLimit: number;
  balance: number;
  updatedAt: string;
}
