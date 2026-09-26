import { z } from "zod";
import { optionalEmailField as optionalEmail, optionalText } from "./crm";
import { listQuerySchema } from "./pagination";
import { patchOf } from "./patch";

/**
 * A lightweight address book for people who aren't a travel customer and don't have a portal account: a hotel's
 * reservations contact, a visa agent, a referral source. Deliberately not linked to bills or payments.
 */
export const CONTACT_TYPES = ["SUPPLIER", "AGENT", "GENERAL"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  SUPPLIER: "Supplier",
  AGENT: "Agent",
  GENERAL: "General",
};

const optionalPhoneLoose = z
  .string()
  .trim()
  .max(20)
  .optional()
  .nullable()
  .transform((v) => v || null);

const contactBase = z.object({
  type: z.enum(CONTACT_TYPES).default("GENERAL"),
  name: z.string().trim().min(2, "Enter a name").max(160),
  phone: optionalPhoneLoose,
  altPhone: optionalPhoneLoose,
  email: optionalEmail,
  company: optionalText(160),
  designation: optionalText(120),
  city: optionalText(80),
  state: optionalText(80),
  notes: optionalText(2000),
});

export const contactInputSchema = contactBase.refine((v) => Boolean(v.phone) || Boolean(v.email), { path: ["email"], message: "Add a phone or an email" });
export type ContactInput = z.input<typeof contactInputSchema>;
export type ContactData = z.output<typeof contactInputSchema>;

/** No either/or requirement on update — a save that only touches, say, notes shouldn't have to resend a phone or email. */
export const contactUpdateSchema = patchOf(contactBase);
export type ContactUpdateData = z.output<typeof contactUpdateSchema>;

export const contactListQuerySchema = listQuerySchema.extend({ type: z.enum(CONTACT_TYPES).optional() });
export type ContactListQuery = z.output<typeof contactListQuerySchema>;

export interface ContactRow {
  id: string;
  type: ContactType;
  name: string;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  company: string | null;
  designation: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  lastContactedAt: string | null;
  createdAt: string;
}
