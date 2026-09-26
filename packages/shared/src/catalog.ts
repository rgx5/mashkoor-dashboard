import { z } from "zod";
import { PRODUCT_TYPES, type ProductType } from "./constants";
import { optionalEmailField, phoneField } from "./crm";
import { listQuerySchema } from "./pagination";
import { patchOf } from "./patch";

// ─── Field helpers ──────────────────────────────────────────────────────────

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => v || null);

const stringList = (max: number, itemMax: number) => z.array(z.string().trim().min(1).max(itemMax)).max(max).default([]);

const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.iso.date("Enter a valid date").nullable());

// ─── Destinations ───────────────────────────────────────────────────────────

export const destinationInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a destination name").max(160),
  slug,
  country: z.string().trim().min(2).max(80),
  region: optionalText(80),
  summary: optionalText(300),
  description: optionalText(8000),
  heroImageUrl: optionalUrl,
  highlights: stringList(20, 160),
  seoTitle: optionalText(160),
  seoDescription: optionalText(300),
  published: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});
export type DestinationInput = z.input<typeof destinationInputSchema>;
export type DestinationData = z.output<typeof destinationInputSchema>;
export const destinationUpdateSchema = patchOf(destinationInputSchema);
export type DestinationUpdateData = z.output<typeof destinationUpdateSchema>;

export interface Destination {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  summary: string | null;
  description: string | null;
  heroImageUrl: string | null;
  highlights: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  published: boolean;
  sortOrder: number;
  packageCount: number;
  createdAt: string;
  updatedAt: string;
}

export const destinationListQuerySchema = listQuerySchema.extend({ published: z.coerce.boolean().optional() });
export type DestinationListQuery = z.output<typeof destinationListQuerySchema>;

// ─── Packages ───────────────────────────────────────────────────────────────

export const packageDayPlanSchema = z.object({
  day: z.coerce.number().int().min(1).max(60),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
});
export type PackageDayPlan = z.output<typeof packageDayPlanSchema>;

export const packageHotelStaySchema = z.object({
  city: z.string().trim().min(1).max(80),
  hotelName: z.string().trim().min(1).max(160),
  nights: z.coerce.number().int().min(1).max(60),
  roomType: z.string().trim().max(80).default(""),
  mealPlan: z.string().trim().max(40).default(""),
});
export type PackageHotelStay = z.output<typeof packageHotelStaySchema>;

export const packagePriceTierSchema = z.object({
  label: z.string().trim().min(1, "Name this price tier").max(80),
  adultPrice: z.coerce.number().int().min(0),
  childPrice: z.coerce.number().int().min(0).nullable().optional(),
  currency: z.string().trim().max(3).default("INR"),
  validFrom: optionalDate,
  validTo: optionalDate,
});
export type PackagePriceTier = z.output<typeof packagePriceTierSchema>;

export const packageInputSchema = z.object({
  title: z.string().trim().min(2, "Enter a package title").max(200),
  slug,
  productType: z.enum(PRODUCT_TYPES),
  destinationId: z.uuid().nullable().optional(),
  summary: optionalText(300),
  description: optionalText(8000),
  nights: z.coerce.number().int().min(0).max(120).default(0),
  days: z.coerce.number().int().min(0).max(120).default(0),
  heroImageUrl: optionalUrl,
  galleryUrls: z.array(optionalUrl.pipe(z.string())).max(30).default([]),
  highlights: stringList(20, 160),
  inclusions: stringList(30, 160),
  exclusions: stringList(30, 160),
  itinerary: z.array(packageDayPlanSchema).max(60).default([]),
  hotels: z.array(packageHotelStaySchema).max(30).default([]),
  priceTiers: z.array(packagePriceTierSchema).max(20).default([]),
  seoTitle: optionalText(160),
  seoDescription: optionalText(300),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});
export type PackageInput = z.input<typeof packageInputSchema>;
export type PackageData = z.output<typeof packageInputSchema>;
export const packageUpdateSchema = patchOf(packageInputSchema);
export type PackageUpdateData = z.output<typeof packageUpdateSchema>;

export interface PackageRow {
  id: string;
  refCode: string;
  slug: string;
  title: string;
  productType: ProductType;
  destination: { id: string; name: string } | null;
  nights: number;
  days: number;
  heroImageUrl: string | null;
  fromPrice: number | null;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface PackageDetail extends PackageRow {
  summary: string | null;
  description: string | null;
  galleryUrls: string[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  itinerary: PackageDayPlan[];
  hotels: PackageHotelStay[];
  priceTiers: PackagePriceTier[];
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
}

export const packageListQuerySchema = listQuerySchema.extend({
  productType: z.enum(PRODUCT_TYPES).optional(),
  destinationId: z.uuid().optional(),
  published: z.coerce.boolean().optional(),
});
export type PackageListQuery = z.output<typeof packageListQuerySchema>;

// ─── Package departures ─────────────────────────────────────────────────────
// Fixed date + seat count a package can be booked directly against from the website. Optional: a package with
// none of these is still enquiry-only (staff quote it), which is the right default for a custom/FIT trip.

const packageDepartureFields = z.object({
  departureDate: z.iso.date("Enter a valid departure date"),
  returnDate: optionalDate,
  pricePerHead: z.coerce.number().int().min(0),
  /// Leave blank to require full payment upfront; set to collect a deposit and bill the rest later.
  depositPerHead: z.coerce.number().int().min(0).nullable().optional(),
  totalSeats: z.coerce.number().int().min(1).max(999),
  active: z.boolean().default(true),
});

const withDepartureRefinements = <T extends z.ZodType<{ depositPerHead?: number | null; pricePerHead: number; returnDate?: string | null; departureDate: string }>>(schema: T) =>
  schema
    .refine((v) => v.depositPerHead == null || v.depositPerHead <= v.pricePerHead, { path: ["depositPerHead"], message: "The deposit can't exceed the full price" })
    .refine((v) => !v.returnDate || v.returnDate >= v.departureDate, { path: ["returnDate"], message: "Return date can't be before departure" });

export const packageDepartureInputSchema = withDepartureRefinements(packageDepartureFields);
export type PackageDepartureInput = z.input<typeof packageDepartureInputSchema>;
export type PackageDepartureData = z.output<typeof packageDepartureInputSchema>;

// A PATCH allows any subset of fields, so cross-field refinements can't run here — the service re-checks the
// ones that still matter (e.g. seats not going below what's already booked) against the stored row instead.
export const packageDepartureUpdateSchema = patchOf(packageDepartureFields);
export type PackageDepartureUpdateData = z.output<typeof packageDepartureUpdateSchema>;

export interface PackageDepartureRow {
  id: string;
  packageId: string;
  departureDate: string;
  returnDate: string | null;
  pricePerHead: number;
  depositPerHead: number | null;
  totalSeats: number;
  bookedSeats: number;
  seatsLeft: number;
  active: boolean;
  createdAt: string;
}

// ─── Direct website booking ─────────────────────────────────────────────────

export const publicDepartureBookingSchema = z.object({
  departureId: z.uuid(),
  travelerCount: z.coerce.number().int().min(1).max(30),
  contactName: z.string().trim().min(2, "Enter your name").max(160),
  phone: phoneField,
  email: optionalEmailField,
  notes: optionalText(1000),
});
export type PublicDepartureBooking = z.output<typeof publicDepartureBookingSchema>;

export interface PublicDepartureBookingResult {
  bookingRef: string;
  paymentUrl: string;
  amountDue: number;
  expiresAt: string;
}

// ─── Testimonials ───────────────────────────────────────────────────────────

export const testimonialInputSchema = z.object({
  customerName: z.string().trim().min(2, "Enter the customer's name").max(160),
  location: optionalText(80),
  productType: z.enum(PRODUCT_TYPES).nullable().optional(),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  quote: z.string().trim().min(10, "Write out the testimonial").max(2000),
  photoUrl: optionalUrl,
  published: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});
export type TestimonialInput = z.input<typeof testimonialInputSchema>;
export type TestimonialData = z.output<typeof testimonialInputSchema>;
export const testimonialUpdateSchema = patchOf(testimonialInputSchema);
export type TestimonialUpdateData = z.output<typeof testimonialUpdateSchema>;

export interface Testimonial {
  id: string;
  customerName: string;
  location: string | null;
  productType: ProductType | null;
  rating: number;
  quote: string;
  photoUrl: string | null;
  published: boolean;
  sortOrder: number;
  createdAt: string;
}

// ─── FAQs ───────────────────────────────────────────────────────────────────

export const faqInputSchema = z.object({
  category: z.string().trim().min(1).max(60).default("General"),
  question: z.string().trim().min(4, "Enter the question").max(300),
  answer: z.string().trim().min(4, "Enter the answer").max(4000),
  published: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});
export type FaqInput = z.input<typeof faqInputSchema>;
export type FaqData = z.output<typeof faqInputSchema>;
export const faqUpdateSchema = patchOf(faqInputSchema);
export type FaqUpdateData = z.output<typeof faqUpdateSchema>;

export interface Faq {
  id: string;
  category: string;
  question: string;
  answer: string;
  published: boolean;
  sortOrder: number;
}
