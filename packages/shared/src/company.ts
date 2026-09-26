import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

/** Letterhead, tax and bank details printed on quotations. Stored as the `company.profile` setting. */
export const companyProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(160),
  legalName: text(160),
  address: text(400),
  email: text(160),
  phones: z.array(z.string().trim().min(3).max(30)).max(5).default([]),
  gstin: text(20),
  pan: text(12),
  bank: z
    .object({
      beneficiary: text(160),
      bankName: text(120),
      accountNo: text(40),
      ifsc: text(20),
      branch: text(120),
    })
    .default({ beneficiary: null, bankName: null, accountNo: null, ifsc: null, branch: null }),
  /** Letterhead logo as a small PNG/JPEG data URL (uploaded from the company profile page). */
  logoDataUrl: z.string().max(450_000).regex(/^data:image\/(png|jpeg);base64,/, "Use a PNG or JPEG").optional().nullable().transform((v) => v || null),
  /** UPI address; printed as a scan-to-pay QR on quotations. */
  upiId: text(80),
  documentsRequired: z.array(z.string().trim().min(1).max(160)).max(15).default([]),
  /** Pre-fills the terms of every new quotation. */
  defaultTerms: text(12000),
});
export type CompanyProfileInput = z.input<typeof companyProfileSchema>;
export type CompanyProfile = z.output<typeof companyProfileSchema>;
