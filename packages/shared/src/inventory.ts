import { z } from "zod";
import { CABIN_CLASSES, MEAL_PLANS, PRODUCT_TYPES, type CabinClass, type MealPlan, type ProductType } from "./constants";
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

const dateOnly = z.iso.date("Enter a valid date");
const isoDateTime = z.iso.datetime({ offset: true, message: "Enter a valid date and time" });
const money = z.coerce.number().int().min(0);

// ─── Hotels & room types ────────────────────────────────────────────────────

export const hotelInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the hotel name").max(160),
  city: z.string().trim().min(1, "Enter the city").max(80),
  country: z.string().trim().min(2).max(2).default("SA"),
  category: z.coerce.number().int().min(1).max(7).nullable().optional(),
  address: optionalText(300),
  phone: optionalText(30),
  notes: optionalText(2000),
  active: z.boolean().default(true),
});
export type HotelInput = z.input<typeof hotelInputSchema>;
export type HotelData = z.output<typeof hotelInputSchema>;
export const hotelUpdateSchema = patchOf(hotelInputSchema);
export type HotelUpdateData = z.output<typeof hotelUpdateSchema>;

export interface HotelRow {
  id: string;
  name: string;
  city: string;
  country: string;
  category: number | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  roomTypeCount: number;
  createdAt: string;
}

export interface HotelDetail extends HotelRow {
  roomTypes: (RoomTypeRow & { ratePeriods: RatePeriodRow[] })[];
}

export const hotelListQuerySchema = listQuerySchema.extend({ active: z.coerce.boolean().optional() });
export type HotelListQuery = z.output<typeof hotelListQuerySchema>;

export const roomTypeInputSchema = z.object({
  hotelId: z.uuid(),
  name: z.string().trim().min(2, "Enter the room type name").max(120),
  maxAdults: z.coerce.number().int().min(1).max(10).default(2),
  maxChildren: z.coerce.number().int().min(0).max(10).default(1),
  mealPlan: z.enum(MEAL_PLANS).default("BREAKFAST"),
  active: z.boolean().default(true),
});
export type RoomTypeInput = z.input<typeof roomTypeInputSchema>;
export type RoomTypeData = z.output<typeof roomTypeInputSchema>;
export const roomTypeUpdateSchema = patchOf(roomTypeInputSchema.omit({ hotelId: true }));
export type RoomTypeUpdateData = z.output<typeof roomTypeUpdateSchema>;

export interface RoomTypeRow {
  id: string;
  hotelId: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
  mealPlan: MealPlan;
  active: boolean;
  ratePeriodCount: number;
}

export interface RoomTypeDetail extends RoomTypeRow {
  hotel: { id: string; name: string; city: string };
  ratePeriods: RatePeriodRow[];
}

// ─── Rate periods (room availability) ───────────────────────────────────────

const rateCurrency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("INR");

export const ratePeriodInputSchema = z
  .object({
    roomTypeId: z.uuid(),
    startDate: dateOnly,
    endDate: dateOnly,
    /** In rupees. For a foreign-currency rate the server works it out from `foreignAmount` and `fxRate`. */
    costPrice: money,
    /** The currency the hotel quoted the rate in. */
    currency: rateCurrency,
    foreignAmount: z.coerce.number().min(0).nullable().optional(),
    fxRate: z.coerce.number().positive().nullable().optional(),
    totalRooms: z.coerce.number().int().min(1).max(9999),
    notes: optionalText(500),
  })
  .refine((v) => v.endDate > v.startDate, { path: ["endDate"], message: "End date must be after the start date" })
  .refine((v) => v.currency === "INR" || (v.foreignAmount != null && Boolean(v.fxRate)), { path: ["foreignAmount"], message: "Enter the rate in this currency" });
export type RatePeriodInput = z.input<typeof ratePeriodInputSchema>;
export type RatePeriodData = z.output<typeof ratePeriodInputSchema>;

export const ratePeriodUpdateSchema = patchOf(
  z.object({
    startDate: dateOnly,
    endDate: dateOnly,
    costPrice: money,
    currency: rateCurrency,
    foreignAmount: z.coerce.number().min(0).nullable(),
    fxRate: z.coerce.number().positive().nullable(),
    totalRooms: z.coerce.number().int().min(1).max(9999),
    notes: optionalText(500),
  }),
);
export type RatePeriodUpdateData = z.output<typeof ratePeriodUpdateSchema>;

export interface RatePeriodRow {
  id: string;
  roomTypeId: string;
  startDate: string;
  endDate: string;
  /** Supplier cost in rupees. Null for staff who may not see it (sales agents). */
  costPrice: number | null;
  /** What the hotel quoted, when that wasn't rupees. Hidden together with the cost. */
  currency: string;
  foreignAmount: number | null;
  fxRate: number | null;
  totalRooms: number;
  bookedRooms: number;
  available: number;
  notes: string | null;
}

/** For the booking wizard: a room type with its available rate periods for the chosen dates. */
export interface RoomAvailability {
  hotel: { id: string; name: string; city: string; category: number | null };
  roomType: { id: string; name: string; mealPlan: MealPlan; maxAdults: number; maxChildren: number };
  ratePeriod: RatePeriodRow;
}

// ─── Flight seat blocks ─────────────────────────────────────────────────────

export const flightSeatBlockInputSchema = z
  .object({
    airline: z.string().trim().min(2, "Enter the airline").max(80),
    flightNumber: z.string().trim().min(2, "Enter the flight number").max(20).toUpperCase(),
    origin: z.string().trim().min(3, "Enter the origin airport code").max(4).toUpperCase(),
    destination: z.string().trim().min(3, "Enter the destination airport code").max(4).toUpperCase(),
    departureAt: isoDateTime,
    arrivalAt: isoDateTime.optional().nullable(),
    cabinClass: z.enum(CABIN_CLASSES).default("ECONOMY"),
    totalSeats: z.coerce.number().int().min(1).max(999),
    costPrice: money,
    notes: optionalText(500),
  })
  .refine((v) => !v.arrivalAt || v.arrivalAt > v.departureAt, { path: ["arrivalAt"], message: "Arrival must be after departure" });
export type FlightSeatBlockInput = z.input<typeof flightSeatBlockInputSchema>;
export type FlightSeatBlockData = z.output<typeof flightSeatBlockInputSchema>;

export const flightSeatBlockUpdateSchema = patchOf(
  z.object({
    airline: z.string().trim().min(2).max(80),
    flightNumber: z.string().trim().min(2).max(20).toUpperCase(),
    origin: z.string().trim().min(3).max(4).toUpperCase(),
    destination: z.string().trim().min(3).max(4).toUpperCase(),
    departureAt: isoDateTime,
    arrivalAt: isoDateTime.nullable(),
    cabinClass: z.enum(CABIN_CLASSES),
    totalSeats: z.coerce.number().int().min(1).max(999),
    costPrice: money,
    notes: optionalText(500),
  }),
);
export type FlightSeatBlockUpdateData = z.output<typeof flightSeatBlockUpdateSchema>;

export interface FlightSeatBlockRow {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string | null;
  cabinClass: CabinClass;
  totalSeats: number;
  bookedSeats: number;
  available: number;
  /** Supplier cost. Null for staff who may not see it (sales agents). */
  costPrice: number | null;
  notes: string | null;
}

export const flightSeatBlockListQuerySchema = listQuerySchema.extend({
  origin: z.string().max(4).optional(),
  destination: z.string().max(4).optional(),
  from: z.iso.date().optional(),
});
export type FlightSeatBlockListQuery = z.output<typeof flightSeatBlockListQuerySchema>;

/** Staff search across both kinds of inventory, used by the booking wizard. */
export const inventorySearchQuerySchema = z.object({
  kind: z.enum(["HOTEL", "FLIGHT"]),
  city: z.string().max(80).optional(),
  origin: z.string().max(4).optional(),
  destination: z.string().max(4).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type InventorySearchQuery = z.output<typeof inventorySearchQuerySchema>;

/** Searching inventory from a quotation: the same filters, plus the product type so the customer price can be worked out. */
export const quoteInventorySearchQuerySchema = inventorySearchQuerySchema.extend({ productType: z.enum(PRODUCT_TYPES).default("HOLIDAY") });
export type QuoteInventorySearchQuery = z.input<typeof quoteInventorySearchQuerySchema>;

/** B2B search across both kinds of inventory — the agency's price, never Mashkoor's cost. */
export interface B2BInventorySearchQuery {
  kind: "HOTEL" | "FLIGHT";
  productType: ProductType;
  city?: string;
  origin?: string;
  destination?: string;
  from?: string;
  to?: string;
}

export type B2BFlightAvailability = Omit<FlightSeatBlockRow, "costPrice" | "notes" | "totalSeats" | "bookedSeats"> & { price: number };

export interface B2BRoomAvailability {
  hotel: RoomAvailability["hotel"];
  roomType: RoomAvailability["roomType"];
  stay: { id: string; startDate: string; endDate: string; available: number };
  price: number;
}
