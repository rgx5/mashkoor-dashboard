import { z } from "zod";
import type { PublicItinerary } from "./itineraries";

// ─── Trip updates: what staff tell the customer about a booking ─────────────

export const tripUpdateInputSchema = z.object({
  bookingId: z.uuid(),
  message: z.string().trim().min(2, "Write the update").max(1000),
  /** Email the customer (or the agency contact for a partner booking). */
  notify: z.boolean().default(true),
});
export type TripUpdateInput = z.input<typeof tripUpdateInputSchema>;
export type TripUpdateData = z.output<typeof tripUpdateInputSchema>;

export const tripUpdateListQuerySchema = z.object({ bookingId: z.uuid() });
export type TripUpdateListQuery = z.output<typeof tripUpdateListQuerySchema>;

export interface TripUpdateRow {
  id: string;
  message: string;
  /** Staff see who posted it; customers see "Mashkoor team". */
  author: string;
  createdAt: string;
}

// ─── Documents: visas, tickets, vouchers … ──────────────────────────────────

export const BOOKING_DOCUMENT_KINDS = ["TICKET", "VISA", "VOUCHER", "INSURANCE", "ITINERARY", "INVOICE", "OTHER"] as const;
export type BookingDocumentKind = (typeof BOOKING_DOCUMENT_KINDS)[number];
export const BOOKING_DOCUMENT_KIND_LABELS: Record<BookingDocumentKind, string> = {
  TICKET: "Ticket",
  VISA: "Visa",
  VOUCHER: "Voucher",
  INSURANCE: "Insurance",
  ITINERARY: "Itinerary",
  INVOICE: "Invoice",
  OTHER: "Other",
};

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_BOOKING = 40;
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

/** Sent as query parameters on the upload request; the file itself is the request body. */
export const documentUploadQuerySchema = z.object({
  bookingId: z.uuid(),
  name: z.string().trim().min(1, "Name the document").max(120),
  fileName: z.string().trim().min(1).max(200),
  kind: z.enum(BOOKING_DOCUMENT_KINDS).default("OTHER"),
  visibleToCustomer: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  notify: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});
export type DocumentUploadQuery = z.output<typeof documentUploadQuerySchema>;

export const documentListQuerySchema = z.object({ bookingId: z.uuid() });
export type DocumentListQuery = z.output<typeof documentListQuerySchema>;

export const documentVisibilitySchema = z.object({ visibleToCustomer: z.boolean() });

export interface BookingDocumentRow {
  id: string;
  kind: BookingDocumentKind;
  name: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visibleToCustomer: boolean;
  createdAt: string;
}

/** A document row plus which booking it's on — for the Customer 360 view, which spans every booking a customer has. */
export interface CustomerDocumentRow extends BookingDocumentRow {
  booking: { id: string; refNo: string };
}

// ─── Trip timeline (customer view) ──────────────────────────────────────────

export interface TimelineStep {
  key: "received" | "payment" | "confirmed" | "documents" | "travel" | "completed" | "cancelled";
  label: string;
  state: "done" | "current" | "upcoming";
  detail: string | null;
}

export interface TravellerReadiness {
  id: string;
  name: string;
  /** Things still needed before travel, e.g. "Passport number". Empty means ready. */
  missing: string[];
}

export interface TripTimeline {
  steps: TimelineStep[];
  updates: TripUpdateRow[];
  travellers: TravellerReadiness[];
  documentCount: number;
  cancelRequestedAt: string | null;
}

// ─── Customer home: what needs you ──────────────────────────────────────────

export type PortalActionKind = "PLAN" | "PAYMENT" | "TRAVELLERS" | "DOCUMENTS" | "REVIEW" | "REQUEST";

export interface PortalAction {
  id: string;
  kind: PortalActionKind;
  title: string;
  detail: string;
  /** In-portal path, e.g. /b2c/trips/…. */
  to: string;
  tone: "urgent" | "normal";
}

export interface CustomerHome {
  customerName: string;
  upcomingTrip: {
    id: string;
    refNo: string;
    title: string;
    travelFrom: string | null;
    daysToGo: number | null;
    status: string;
    balanceDue: number;
  } | null;
  actions: PortalAction[];
  recentUpdates: { tripId: string; tripRef: string; message: string; createdAt: string }[];
  totals: { activeTrips: number; totalDue: number; openRequests: number; plansToReview: number };
}

// ─── Plans (itineraries) in the portal ──────────────────────────────────────

export interface PortalItinerary extends PublicItinerary {
  id: string;
  refNo: string;
  convertedBookingId: string | null;
  /** Set when the customer has asked for changes and staff haven't reissued the plan yet. */
  changesRequestedAt: string | null;
}

export const itineraryChangesSchema = z.object({ message: z.string().trim().min(5, "Tell us what you'd like changed").max(1500) });

// ─── Reviews ────────────────────────────────────────────────────────────────

export const tripReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating").max(5),
  comment: z.string().trim().min(10, "Tell us a little more").max(1000),
});
export type TripReviewInput = z.output<typeof tripReviewSchema>;

export interface TripReview {
  rating: number;
  comment: string;
  submittedAt: string;
  /** Reviews are checked by staff before they can appear on the website. */
  published: boolean;
}

// ─── Portal access (staff view of a customer's login) ───────────────────────

export interface PortalAccessInfo {
  hasEmail: boolean;
  email: string | null;
  /** NONE = no login yet. */
  status: "NONE" | "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
}

// ─── Trip requests (customer view) ──────────────────────────────────────────

export type TripRequestProgress = "RECEIVED" | "PREPARING" | "PLAN_READY" | "BOOKED" | "CLOSED";
export const TRIP_REQUEST_PROGRESS_LABELS: Record<TripRequestProgress, string> = {
  RECEIVED: "Received",
  PREPARING: "We're preparing your plan",
  PLAN_READY: "Your plan is ready",
  BOOKED: "Booked",
  CLOSED: "Closed",
};
