import { z } from "zod";
import { PRODUCT_TYPES, TRIP_TYPES, type ProductType, type TripType } from "./constants";
import { listQuerySchema } from "./pagination";
import { patchOf } from "./patch";

export const ITINERARY_STATUSES = ["DRAFT", "SHARED", "ACCEPTED", "CONVERTED"] as const;
export type ItineraryStatus = (typeof ITINERARY_STATUSES)[number];
export const ITINERARY_STATUS_LABELS: Record<ItineraryStatus, string> = { DRAFT: "Draft", SHARED: "Shared", ACCEPTED: "Accepted", CONVERTED: "Booked" };

const uuid = z.uuid();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.iso.date("Enter a valid date").nullable());
const lineList = (max: number) => z.array(z.string().trim().min(1).max(200)).max(max).default([]);

export const itineraryDaySchema = z.object({
  day: z.coerce.number().int().min(1).max(90),
  title: z.string().trim().min(1, "Give this day a title").max(160),
  description: z.string().trim().max(3000).default(""),
});
export type ItineraryDay = z.output<typeof itineraryDaySchema>;

export const ITINERARY_LINE_KINDS = ["FLIGHT", "HOTEL", "MEALS", "TRANSPORT", "VISA", "OTHER"] as const;
export type ItineraryLineKind = (typeof ITINERARY_LINE_KINDS)[number];
export const ITINERARY_LINE_KIND_LABELS: Record<ItineraryLineKind, string> = { FLIGHT: "Air ticket", HOTEL: "Hotel", MEALS: "Meals", TRANSPORT: "Transport", VISA: "Visa", OTHER: "Other" };

export const LINE_PAX_TYPES = ["Adult", "Child", "Infant"] as const;
export const QUOTE_ROOM_TYPES = ["Single", "Double", "Triple", "Quad", "Quint"] as const;
export const LINE_MEAL_PLANS = [
  { value: "BF", label: "Breakfast (BF)" },
  { value: "BF + Dinner", label: "Half board (BF + Dinner)" },
  { value: "BF + Lunch + Dinner", label: "Full board (BF + Lunch + Dinner)" },
] as const;

const attrText = z.string().max(120).optional();
const attrDate = z.union([z.literal(""), z.iso.date("Enter a valid date")]).optional();

/**
 * What a line needs to say depends on its type — an air ticket has a sector and dates, a hotel a room type and a stay,
 * meals a plan, transport a vehicle. These are filled in on the itinerary page; the line's description and detail text
 * are then written from them (see `describeLine`) so every quotation reads the same way.
 */
export const lineAttrsSchema = z.object({
  /** Air ticket */
  paxType: attrText,
  airline: attrText,
  from: attrText,
  to: attrText,
  via: attrText,
  returnTrip: z.boolean().optional(),
  returnFrom: attrText,
  returnTo: attrText,
  returnVia: attrText,
  departureDate: attrDate,
  returnDate: attrDate,
  /** Hotel and meals */
  hotel: attrText,
  city: attrText,
  roomType: attrText,
  mealPlan: attrText,
  provider: attrText,
  checkIn: attrDate,
  checkOut: attrDate,
  /** Transport */
  vehicle: attrText,
  date: attrDate,
  /** Visa */
  visaType: attrText,
  /** The inventory record a hotel or flight line was picked from, kept for reference. */
  ratePeriodId: attrText,
  flightSeatBlockId: attrText,
  /** Hotel, meals and transport: how many people the line covers (the quantity is rooms, vehicles, etc.). */
  pax: z.number().int().min(1).max(999).nullable().optional(),
  notes: z.string().max(500).optional(),
});
export type ItineraryLineAttrs = z.output<typeof lineAttrsSchema>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `2026-09-16` → `16-Sep-2026`, the way the quotation prints dates. */
export const quoteDate = (value?: string | null) => {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}-${MONTHS[Number(m) - 1] ?? m}-${y}`;
};

/** Whole nights between two dates, or null when either is missing or the order is wrong. */
export const nightsBetween = (from?: string | null, to?: string | null) => {
  if (!from || !to) return null;
  const nights = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  return nights > 0 ? nights : null;
};

const joinParts = (parts: (string | number | false | null | undefined)[], separator: string) => parts.filter(Boolean).join(separator);
const sector = (from?: string, to?: string, via?: string) => (from || to ? `${joinParts([from, to], " to ")}${via ? ` via ${via}` : ""}` : "");

/**
 * Writes a line's description and detail text from its type and attributes, in the form clients are used to:
 * "Air ticket - Adult - Gulf Airlines" with the sector and dates underneath, "Hotel - Triple - Voco, Makkah" with the stay.
 * "Other" lines are typed by hand, so they return null.
 */
export function describeLine(kind: ItineraryLineKind, a: ItineraryLineAttrs = {}): { description: string; detail: string | null } | null {
  const nights = nightsBetween(a.checkIn, a.checkOut);
  const stay = joinParts([a.checkIn && `Check-in ${quoteDate(a.checkIn)}`, a.checkOut && `Check-out ${quoteDate(a.checkOut)}`, nights && `${nights} night${nights > 1 ? "s" : ""}`, a.pax && `PAX ${a.pax}`], " · ");
  let description: string;
  const lines: string[] = [];

  switch (kind) {
    case "FLIGHT": {
      description = joinParts(["Air ticket", a.paxType || "Adult", a.airline], " - ");
      const out = sector(a.from, a.to, a.via);
      const back = a.returnTrip ? `Return ${sector(a.returnFrom || a.to, a.returnTo || a.from, a.returnVia)}` : "";
      lines.push(joinParts([out, back], " · "));
      lines.push(joinParts([a.departureDate && `Departure ${quoteDate(a.departureDate)}`, a.returnTrip && a.returnDate && `Return ${quoteDate(a.returnDate)}`], " · "));
      break;
    }
    case "HOTEL":
      description = joinParts(["Hotel", a.roomType, joinParts([a.hotel, a.city], ", ")], " - ");
      lines.push(stay);
      break;
    case "MEALS":
      description = joinParts(["Meals", a.mealPlan, a.provider], " - ");
      lines.push(stay);
      break;
    case "TRANSPORT":
      description = joinParts(["Transport", a.vehicle], " - ");
      lines.push(joinParts([sector(a.from, a.to) && `Sector ${sector(a.from, a.to)}`, a.date && quoteDate(a.date), a.pax && `PAX ${a.pax}`], " · "));
      break;
    case "VISA":
      description = joinParts(["Visa", a.visaType], " - ");
      break;
    default:
      return null;
  }
  if (a.notes) lines.push(a.notes);
  return { description, detail: lines.filter(Boolean).join("\n") || null };
}

export const itineraryLineSchema = z.object({
  kind: z.enum(ITINERARY_LINE_KINDS).default("OTHER"),
  /** The type-specific fields (sector, dates, room type…) the description and detail were written from. */
  attrs: lineAttrsSchema.optional(),
  description: z.string().trim().min(1, "Describe this line").max(200),
  /** Dates, nights, sector or passengers — printed under the description on the quotation. */
  detail: z.string().trim().max(3000).optional().nullable().transform((v) => v || null),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  /** Always INR, whole rupees — the actual figure every total, the PDF and the converted booking use. For a
   * foreign-currency line this is `foreignAmount * fxRate`, rounded; the UI computes it, it isn't recomputed here. */
  unitPrice: z.coerce.number().int("Enter the price in whole rupees, without paise").min(0, "The price can't be negative"),
  /** ISO code the supplier actually billed in, e.g. "SAR" for a Saudi hotel. "INR" means `foreignAmount`/`fxRate` are unused. */
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("INR"),
  /** Per-unit price in `currency`, before conversion. Null/omitted when `currency` is INR. */
  foreignAmount: z.coerce.number().min(0).nullable().optional(),
  /** INR per 1 unit of `currency`, snapshotted from the Currency table when this line was priced — never re-derived
   * later, so updating a rate afterwards can't silently change what a customer was already quoted. */
  fxRate: z.coerce.number().positive().nullable().optional(),
  /** Discount on this line, in rupees. */
  discount: z.coerce.number().int().min(0).default(0),
  /** Tax on this line as a percentage of (amount - discount). */
  taxPercent: z.coerce.number().min(0).max(100).default(0),
});
export type ItineraryLine = z.output<typeof itineraryLineSchema>;

export const paymentScheduleItemSchema = z.object({
  label: z.string().trim().min(1, "Name this instalment").max(60),
  dueDate: z.string().optional().nullable().transform((v) => v || null).pipe(z.iso.date("Enter a valid date").nullable()),
  amount: z.coerce.number().int().min(0),
});
export type PaymentScheduleItem = z.output<typeof paymentScheduleItemSchema>;

/** Rows of the "Trip" table on the quotation — one per flight leg. All optional text: shown exactly as typed. */
export const flightSegmentSchema = z.object({
  tripType: z.string().trim().max(40).default(""),
  departureCity: z.string().trim().max(60).default(""),
  departureAt: z.string().trim().max(40).default(""),
  arrivalCity: z.string().trim().max(60).default(""),
  arrivalAt: z.string().trim().max(40).default(""),
  airline: z.string().trim().max(60).default(""),
  handCarry: z.string().trim().max(30).default(""),
  checkInBaggage: z.string().trim().max(30).default(""),
  zamzam: z.string().trim().max(30).default(""),
});
export type FlightSegment = z.output<typeof flightSegmentSchema>;

/** Rows of the hotel table on the quotation. */
export const hotelStaySchema = z.object({
  city: z.string().trim().max(60).default(""),
  hotel: z.string().trim().max(120).default(""),
  distanceFromHaram: z.string().trim().max(40).default(""),
  checkIn: z.string().trim().max(40).default(""),
  checkOut: z.string().trim().max(40).default(""),
});
export type HotelStay = z.output<typeof hotelStaySchema>;

const itineraryBase = z.object({
  title: z.string().trim().min(2, "Give the itinerary a title").max(200),
  productType: z.enum(PRODUCT_TYPES).default("HOLIDAY"),
  tripType: z.enum(TRIP_TYPES).default("FIT"),
  isTemplate: z.boolean().default(false),
  customerId: uuid.nullable().optional(),
  leadId: uuid.nullable().optional(),
  ownerId: uuid.nullable().optional(),
  /** The person named on the quotation as the customer's contact. Blank means the owner. */
  relationshipManagerId: uuid.nullable().optional(),
  destination: optionalText(160),
  travelFrom: optionalDate,
  travelTo: optionalDate,
  adults: z.coerce.number().int().min(0).max(999).default(1),
  children: z.coerce.number().int().min(0).max(999).default(0),
  days: z.array(itineraryDaySchema).max(90).default([]),
  lines: z.array(itineraryLineSchema).max(60).default([]),
  inclusions: lineList(40),
  exclusions: lineList(40),
  terms: optionalText(12000),
  /** The quotation's subject line; the customer's name is used when blank. */
  subject: optionalText(200),
  quoteDescription: optionalText(2000),
  quoteNotes: optionalText(2000),
  /** Added to (or, if negative, taken off) the total, e.g. a special discount. */
  adjustment: z.coerce.number().int().default(0),
  fullPaymentDueDate: optionalDate,
  paymentSchedule: z.array(paymentScheduleItemSchema).max(8).default([]),
  flights: z.array(flightSegmentSchema).max(12).default([]),
  hotels: z.array(hotelStaySchema).max(12).default([]),
});

export const itineraryInputSchema = itineraryBase.refine((v) => !v.travelFrom || !v.travelTo || v.travelTo >= v.travelFrom, { path: ["travelTo"], message: "Return must be after departure" });
export type ItineraryInput = z.input<typeof itineraryInputSchema>;
export type ItineraryData = z.output<typeof itineraryInputSchema>;
export const itineraryUpdateSchema = patchOf(itineraryBase);
export type ItineraryUpdateData = z.output<typeof itineraryUpdateSchema>;

/** How long a shared quotation link stays valid: 24 hours (1 day), then 2, 3, 4, 5, 7, 10 or 15 days. */
export const QUOTE_VALIDITY_DAYS = [1, 2, 3, 4, 5, 7, 10, 15] as const;
export const quoteValidityLabel = (days: number) => (days === 1 ? "24 hours" : `${days} days`);

export const itineraryShareSchema = z.object({
  validForDays: z.coerce
    .number()
    .int()
    .refine((v) => (QUOTE_VALIDITY_DAYS as readonly number[]).includes(v), "Choose 24 hours, or 2, 3, 4, 5, 7, 10 or 15 days")
    .default(1),
});
export type ItineraryShareInput = z.output<typeof itineraryShareSchema>;

export const itineraryAcceptSchema = z.object({ name: z.string().trim().min(2, "Enter your name").max(120) });

export const itineraryListQuerySchema = listQuerySchema.extend({
  status: z.enum(ITINERARY_STATUSES).optional(),
  template: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  customerId: uuid.optional(),
  leadId: uuid.optional(),
});
export type ItineraryListQuery = z.output<typeof itineraryListQuerySchema>;

/** What one line comes to: quantity x price, less its discount, plus its tax. Whole rupees. */
export const lineTotal = (l: { quantity: number; unitPrice: number; discount?: number; taxPercent?: number }) => {
  const net = Math.max(0, l.quantity * l.unitPrice - (l.discount ?? 0));
  return Math.round(net + (net * (l.taxPercent ?? 0)) / 100);
};

export const itineraryTotal = (lines: { quantity: number; unitPrice: number; discount?: number; taxPercent?: number }[], adjustment = 0) => Math.max(0, lines.reduce((sum, l) => sum + lineTotal(l), 0) + adjustment);

export interface ItineraryRow {
  id: string;
  refNo: string;
  title: string;
  productType: ProductType;
  tripType: TripType;
  status: ItineraryStatus;
  isTemplate: boolean;
  customer: { id: string; fullName: string } | null;
  lead: { id: string; refNo: string } | null;
  owner: { id: string; name: string } | null;
  destination: string | null;
  travelFrom: string | null;
  totalPrice: number;
  viewCount: number;
  shareUrl: string | null;
  validUntil: string | null;
  updatedAt: string;
}

export interface ItineraryDetail extends ItineraryRow {
  relationshipManager: { id: string; name: string } | null;
  travelTo: string | null;
  adults: number;
  children: number;
  days: ItineraryDay[];
  lines: ItineraryLine[];
  inclusions: string[];
  exclusions: string[];
  terms: string | null;
  subject: string | null;
  quoteDescription: string | null;
  quoteNotes: string | null;
  adjustment: number;
  fullPaymentDueDate: string | null;
  paymentSchedule: PaymentScheduleItem[];
  flights: FlightSegment[];
  hotels: HotelStay[];
  sharedAt: string | null;
  lastViewedAt: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
  changesRequestedAt: string | null;
  changesRequestNote: string | null;
  convertedBookingId: string | null;
  createdAt: string;
}

/** What the customer sees at `/i/:token` — no internal IDs, owner or cost. */
export interface PublicItinerary {
  title: string;
  productType: ProductType;
  destination: string | null;
  travelFrom: string | null;
  travelTo: string | null;
  adults: number;
  children: number;
  days: ItineraryDay[];
  lines: ItineraryLine[];
  inclusions: string[];
  exclusions: string[];
  terms: string | null;
  totalPrice: number;
  currency: string;
  status: ItineraryStatus;
  validUntil: string | null;
  expired: boolean;
  acceptedAt: string | null;
  customerName: string | null;
  company: { name: string; phones: string[]; email: string | null };
}
