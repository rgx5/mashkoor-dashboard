import { z } from "zod";
import { BOOKING_ITEM_TYPES, BOOKING_STATUSES, PRODUCT_TYPES, TRIP_TYPES, type BookingItemType, type BookingStatus, type ProductType, type TripType } from "./constants";
import { LEAD_SOURCES, type LeadSource } from "./crm";
import { listQuerySchema } from "./pagination";
import { patchOf } from "./patch";

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

const uuid = z.uuid();
const money = z.coerce.number().int().min(0);

// ─── Booking items ──────────────────────────────────────────────────────────

export const bookingItemInputSchema = z
  .object({
    type: z.enum(BOOKING_ITEM_TYPES),
    description: z.string().trim().min(2, "Describe this item").max(300),
    packageId: uuid.nullable().optional(),
    flightSeatBlockId: uuid.nullable().optional(),
    ratePeriodId: uuid.nullable().optional(),
    quantity: z.coerce.number().int().min(1).max(999).default(1),
    /** Ignored for rooms/seats (the server takes the cost from the inventory record) and for anyone who can't see cost. */
    costPrice: money.default(0),
    sellPrice: money,
  })
  .refine((v) => v.type !== "FLIGHT" || v.flightSeatBlockId, { path: ["flightSeatBlockId"], message: "Choose a flight seat block" })
  .refine((v) => v.type !== "HOTEL" || v.ratePeriodId, { path: ["ratePeriodId"], message: "Choose a room rate" })
  .refine((v) => v.type !== "PACKAGE" || v.packageId, { path: ["packageId"], message: "Choose a package" });
export type BookingItemInput = z.input<typeof bookingItemInputSchema>;
export type BookingItemData = z.output<typeof bookingItemInputSchema>;

/** Correcting a line after it was added: its wording and price. The quantity and what it's linked to stay as booked. */
export const bookingItemUpdateSchema = patchOf(
  z.object({
    description: z.string().trim().min(2, "Describe this item").max(300),
    sellPrice: money,
    /** Manager only, and ignored for rooms/seats whose cost comes from the inventory record. */
    costPrice: money,
  }),
);
export type BookingItemUpdateData = z.output<typeof bookingItemUpdateSchema>;

export interface BookingItemRow {
  id: string;
  type: BookingItemType;
  description: string;
  quantity: number;
  /** Cost price and margin are hidden from staff without the "manage" permission on bookings. */
  costPrice: number | null;
  sellPrice: number;
  package: { id: string; refCode: string; title: string } | null;
  flightSeatBlock: { id: string; airline: string; flightNumber: string; origin: string; destination: string; departureAt: string } | null;
  ratePeriod: { id: string; startDate: string; endDate: string; roomType: { id: string; name: string; hotel: { id: string; name: string; city: string } } } | null;
  /** A partner typed this price for a line with no inventory behind it — staff should check it before approving. */
  partnerQuoted: boolean;
}

// ─── Bookings ───────────────────────────────────────────────────────────────

export const bookingInputSchema = z
  .object({
    customerId: uuid,
    leadId: uuid.nullable().optional(),
    productType: z.enum(PRODUCT_TYPES),
    /** Defaults from the lead's trip type when omitted; FIT if there's no lead either. */
    tripType: z.enum(TRIP_TYPES).optional(),
    destination: optionalText(160),
    travelFrom: optionalDate,
    travelTo: optionalDate,
    notes: optionalText(4000),
    source: z.enum(LEAD_SOURCES).default("PHONE"),
    ownerId: uuid.nullable().optional(),
    discount: money.default(0),
    travelerIds: z.array(uuid).max(50).default([]),
    items: z.array(bookingItemInputSchema).max(50).default([]),
  })
  .refine((v) => !v.travelFrom || !v.travelTo || v.travelTo >= v.travelFrom, { path: ["travelTo"], message: "Return must be after departure" });
export type BookingInput = z.input<typeof bookingInputSchema>;
export type BookingData = z.output<typeof bookingInputSchema>;

export const bookingUpdateSchema = patchOf(
  z.object({
    destination: optionalText(160),
    travelFrom: optionalDate,
    travelTo: optionalDate,
    notes: optionalText(4000),
    discount: money,
    travelerIds: z.array(uuid).max(50),
    /** Managers only (checked in the service): hand the booking to someone else, or back to the unassigned queue. */
    ownerId: uuid.nullable(),
  }),
).refine((v) => !v.travelFrom || !v.travelTo || v.travelTo >= v.travelFrom, { path: ["travelTo"], message: "Return must be after departure" });
export type BookingUpdateData = z.output<typeof bookingUpdateSchema>;

export const bookingStatusChangeSchema = z
  .object({
    status: z.enum(BOOKING_STATUSES),
    reason: optionalText(2000),
    /** Only meaningful when moving to CANCELLED; deducted from any refund once payments (M11) exist. */
    cancellationFee: money.default(0),
  })
  .refine((v) => (v.status !== "CANCELLED" && v.status !== "FAILED") || Boolean(v.reason), { path: ["reason"], message: "Say why this booking didn't go ahead" });
export type BookingStatusChange = z.output<typeof bookingStatusChangeSchema>;

export const bookingListQuerySchema = listQuerySchema.extend({
  status: z.enum(BOOKING_STATUSES).optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  tripType: z.enum(TRIP_TYPES).optional(),
  owner: z.string().max(40).optional(),
  customerId: uuid.optional(),
});
export type BookingListQuery = z.output<typeof bookingListQuerySchema>;

interface UserRefLite {
  id: string;
  name: string;
}

export interface BookingRow {
  id: string;
  refNo: string;
  customer: { id: string; refNo: string; fullName: string; phone: string };
  lead: { id: string; refNo: string } | null;
  productType: ProductType;
  tripType: TripType;
  status: BookingStatus;
  destination: string | null;
  travelFrom: string | null;
  travelTo: string | null;
  totalCost: number | null;
  totalSell: number;
  discount: number;
  currency: string;
  source: LeadSource;
  owner: UserRefLite | null;
  /** Set when a partner has asked to cancel a booking Mashkoor has already started on. */
  cancelRequestedAt: string | null;
  createdAt: string;
}

export interface BookingDetail extends BookingRow {
  notes: string | null;
  cancellationFee: number;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelRequestReason: string | null;
  items: BookingItemRow[];
  travelers: { id: string; firstName: string; lastName: string | null; relation: string }[];
  updatedAt: string;
}

/** A partner cancelling (or asking to cancel) their own booking. */
export const bookingCancelRequestSchema = z.object({ reason: z.string().trim().min(2, "Say why").max(1000) });
export type BookingCancelRequest = z.output<typeof bookingCancelRequestSchema>;

/** A manager turning down a cancellation request, with an optional note for the requester. */
export const bookingDeclineCancelSchema = z.object({ note: optionalText(1000) });
export type BookingDeclineCancel = z.output<typeof bookingDeclineCancelSchema>;
