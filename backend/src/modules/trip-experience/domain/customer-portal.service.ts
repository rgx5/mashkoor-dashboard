import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  OPEN_LEAD_STAGES,
  type CustomerHome,
  type PortalAction,
  type TimelineStep,
  type TravellerReadiness,
  type TripReview,
  type TripReviewInput,
  type TripTimeline,
} from "@mashkoor/shared";
import { toDateOnly, toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { BookingsService } from "../../bookings/domain/bookings.service";
import { PaymentsService } from "../../payments/domain/payments.service";
import { TripUpdatesService } from "./trip-updates.service";

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;
const LIVE_STATUSES = ["PENDING_PAYMENT", "PENDING_APPROVAL", "CONFIRMED", "IN_PROGRESS"] as const;

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: Date | string | null) => (d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(d)) : "");

/** Midnight (IST) today, as a timestamp. */
const istToday = () => Math.floor((Date.now() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
const daysUntil = (date: Date | null) => (date ? Math.round((new Date(`${toDateOnly(date)}T00:00:00+05:30`).getTime() - istToday()) / DAY_MS) : null);

type TravelerLite = { id: string; firstName: string; lastName: string | null; dob: Date | null; passportNoEnc: string | null; passportExpiry: Date | null };

/** What is still missing for one traveller before they can travel. */
function missingFor(t: TravelerLite, travelFrom: Date | null): string[] {
  const missing: string[] = [];
  if (!t.dob) missing.push("Date of birth");
  if (!t.passportNoEnc) missing.push("Passport number");
  if (!t.passportExpiry) missing.push("Passport expiry date");
  else if (travelFrom && t.passportExpiry.getTime() < travelFrom.getTime() + 180 * DAY_MS) missing.push("Passport valid for 6 months after travel");
  return missing;
}

const readiness = (travelers: TravelerLite[], travelFrom: Date | null): TravellerReadiness[] =>
  travelers.map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName ?? ""}`.trim(), missing: missingFor(t, travelFrom) }));

/**
 * Everything the customer sees in their portal that isn't a plain list: the "what needs you" home, the trip timeline,
 * cancellation requests and post-trip reviews. Each of these is fed by something staff do in the admin.
 */
@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly payments: PaymentsService,
    private readonly updates: TripUpdatesService,
    private readonly activities: ActivitiesService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  private customerId(actor: RequestUser) {
    if (!actor.customerId) throw AppError.forbidden();
    return actor.customerId;
  }

  // ─── Home ─────────────────────────────────────────────────────────────────

  async home(actor: RequestUser): Promise<CustomerHome> {
    const customerId = this.customerId(actor);
    const [customer, bookings, plans, openRequests] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { fullName: true } }),
      this.prisma.booking.findMany({
        where: { customerId, status: { notIn: ["CANCELLED", "FAILED"] } },
        include: { travelers: { select: { id: true, firstName: true, lastName: true, dob: true, passportNoEnc: true, passportExpiry: true } }, documents: { where: { visibleToCustomer: true }, select: { createdAt: true } } },
        orderBy: [{ travelFrom: "asc" }, { createdAt: "desc" }],
      }),
      this.prisma.itinerary.findMany({ where: { customerId, isTemplate: false, status: "SHARED" }, orderBy: { sharedAt: "desc" } }),
      this.prisma.lead.count({ where: { customerId, stage: { in: [...OPEN_LEAD_STAGES] } } }),
    ]);

    const live = bookings.filter((b) => (LIVE_STATUSES as readonly string[]).includes(b.status));
    const balances = new Map<string, number>();
    for (const b of live) balances.set(b.id, await this.payments.computeBalance(b.id));

    const today = istToday();
    const actions: PortalAction[] = [];

    for (const plan of plans) {
      if (plan.changesRequestedAt || (plan.validUntil && plan.validUntil.getTime() < Date.now())) continue;
      actions.push({ id: `plan:${plan.id}`, kind: "PLAN", title: `Review your plan: ${plan.title}`, detail: plan.validUntil ? `Valid until ${fmtDate(plan.validUntil)}` : "Ready for you to look at", to: `/b2c/itineraries/${plan.id}`, tone: "normal" });
    }

    for (const b of live) {
      const due = balances.get(b.id) ?? 0;
      const days = daysUntil(b.travelFrom);
      if (due > 0 && b.status !== "PENDING_APPROVAL") {
        actions.push({ id: `pay:${b.id}`, kind: "PAYMENT", title: `Pay ${inr(due)} for ${b.refNo}`, detail: days != null && days >= 0 ? `Travel starts in ${days} day${days === 1 ? "" : "s"}` : "Balance due", to: `/b2c/trips/${b.id}`, tone: b.status === "PENDING_PAYMENT" || (days != null && days <= 14) ? "urgent" : "normal" });
      }
      if (days != null && days >= 0 && days <= 90) {
        const incomplete = readiness(b.travelers, b.travelFrom).filter((t) => t.missing.length > 0);
        if (incomplete.length > 0) actions.push({ id: `travellers:${b.id}`, kind: "TRAVELLERS", title: `Complete details for ${incomplete.length} traveller${incomplete.length === 1 ? "" : "s"}`, detail: `${b.refNo} · ${incomplete[0]!.name}: ${incomplete[0]!.missing[0]}`, to: `/b2c/profile`, tone: days <= 30 ? "urgent" : "normal" });
      }
      const fresh = b.documents.filter((d) => Date.now() - d.createdAt.getTime() < 7 * DAY_MS).length;
      if (fresh > 0) actions.push({ id: `docs:${b.id}`, kind: "DOCUMENTS", title: `${fresh} new document${fresh === 1 ? "" : "s"} for ${b.refNo}`, detail: "Tickets, visas and vouchers are ready to download", to: `/b2c/trips/${b.id}`, tone: "normal" });
    }

    // Recently finished trips that haven't been reviewed yet.
    const finished = bookings.filter((b) => b.status === "COMPLETED" && Date.now() - b.updatedAt.getTime() < 60 * DAY_MS);
    if (finished.length) {
      const reviewed = new Set((await this.prisma.testimonial.findMany({ where: { reviewBookingId: { in: finished.map((b) => b.id) } }, select: { reviewBookingId: true } })).map((t) => t.reviewBookingId));
      for (const b of finished.filter((f) => !reviewed.has(f.id))) actions.push({ id: `review:${b.id}`, kind: "REVIEW", title: "How was your trip?", detail: `Tell us about ${b.destination ?? b.refNo} — it helps other travellers`, to: `/b2c/trips/${b.id}`, tone: "normal" });
    }
    actions.sort((a, b) => Number(b.tone === "urgent") - Number(a.tone === "urgent"));

    const upcoming = live.find((b) => (daysUntil(b.travelFrom) ?? -1) >= 0) ?? live[0] ?? null;
    const updates = bookings.length
      ? await this.prisma.tripUpdate.findMany({ where: { bookingId: { in: bookings.map((b) => b.id) } }, orderBy: { createdAt: "desc" }, take: 5, include: { booking: { select: { id: true, refNo: true } } } })
      : [];

    return {
      customerName: customer.fullName,
      upcomingTrip: upcoming
        ? { id: upcoming.id, refNo: upcoming.refNo, title: [upcoming.destination, upcoming.productType.charAt(0) + upcoming.productType.slice(1).toLowerCase()].filter(Boolean).join(" · ") || upcoming.refNo, travelFrom: toDateOnly(upcoming.travelFrom), daysToGo: daysUntil(upcoming.travelFrom), status: upcoming.status, balanceDue: balances.get(upcoming.id) ?? 0 }
        : null,
      actions,
      recentUpdates: updates.map((u) => ({ tripId: u.booking.id, tripRef: u.booking.refNo, message: u.message, createdAt: toIso(u.createdAt)! })),
      totals: { activeTrips: live.length, totalDue: [...balances.values()].reduce((sum, v) => sum + Math.max(v, 0), 0), openRequests, plansToReview: plans.filter((p) => !p.changesRequestedAt).length },
    };
  }

  // ─── One trip ─────────────────────────────────────────────────────────────

  async timeline(actor: RequestUser, bookingId: string): Promise<TripTimeline> {
    this.customerId(actor);
    const booking = await this.bookings.findAccessible(actor, bookingId, "read");
    const [summary, documentCount, travelers, updates] = await Promise.all([
      this.payments.summaryForBooking(actor, bookingId),
      this.prisma.bookingDocument.count({ where: { bookingId, visibleToCustomer: true } }),
      this.prisma.traveler.findMany({ where: { bookings: { some: { id: bookingId } } }, select: { id: true, firstName: true, lastName: true, dob: true, passportNoEnc: true, passportExpiry: true } }),
      this.updates.list(actor, bookingId),
    ]);
    return {
      steps: this.steps(booking, summary.balanceDue, summary.totalCollected - summary.totalRefunded, documentCount),
      updates,
      travellers: readiness(travelers, booking.travelFrom),
      documentCount,
      cancelRequestedAt: toIso(booking.cancelRequestedAt),
    };
  }

  private steps(b: { status: string; createdAt: Date; travelFrom: Date | null; cancelReason: string | null; totalSell: number }, balanceDue: number, collected: number, documentCount: number): TimelineStep[] {
    const received: TimelineStep = { key: "received", label: "Booking received", state: "done", detail: `On ${fmtDate(b.createdAt)}` };
    if (b.status === "CANCELLED" || b.status === "FAILED") return [received, { key: "cancelled", label: b.status === "FAILED" ? "Could not be completed" : "Cancelled", state: "current", detail: b.cancelReason }];

    const confirmed = ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(b.status);
    const started = b.status === "IN_PROGRESS" || b.status === "COMPLETED";
    const completed = b.status === "COMPLETED";
    const paid = b.totalSell > 0 && balanceDue <= 0;

    return [
      received,
      { key: "payment", label: "Payment", state: paid ? "done" : collected > 0 || b.status === "PENDING_PAYMENT" ? "current" : "upcoming", detail: paid ? "Paid in full" : balanceDue > 0 ? `${inr(balanceDue)} to pay` : null },
      { key: "confirmed", label: "Confirmed by our team", state: confirmed ? "done" : b.status === "PENDING_APPROVAL" || b.status === "PENDING_PAYMENT" ? "current" : "upcoming", detail: null },
      { key: "documents", label: "Travel documents", state: confirmed && documentCount > 0 ? "done" : confirmed ? "current" : "upcoming", detail: documentCount > 0 ? `${documentCount} ready to download` : "Tickets, visas and vouchers appear here" },
      { key: "travel", label: "Travel", state: completed ? "done" : started ? "current" : "upcoming", detail: b.travelFrom ? `Departs ${fmtDate(b.travelFrom)}` : null },
      { key: "completed", label: "Trip completed", state: completed ? "done" : "upcoming", detail: null },
    ];
  }

  /**
   * A customer can't cancel on their own: money and supplier commitments are involved. This records the request, flags
   * the booking for staff, and tells the team — the same flag agencies use, so the admin sees one consistent banner.
   */
  async requestCancellation(actor: RequestUser, bookingId: string, reason: string) {
    this.customerId(actor);
    const booking = await this.bookings.findAccessible(actor, bookingId, "read");
    if (["CANCELLED", "COMPLETED", "FAILED"].includes(booking.status)) throw AppError.conflict("This trip can no longer be cancelled");
    if (booking.cancelRequestedAt) throw AppError.conflict("You've already asked to cancel this trip — our team will be in touch");

    await this.prisma.booking.update({ where: { id: bookingId }, data: { cancelRequestedAt: new Date(), cancelRequestReason: reason } });
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: booking.customerId }, select: { fullName: true } });
    await this.activities.record({ entityType: "CUSTOMER", entityId: booking.customerId, customerId: booking.customerId, type: "SYSTEM", body: `${customer.fullName} asked to cancel ${booking.refNo}: ${reason}` });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.cancel_requested", entityType: "Booking", entityId: bookingId, after: { reason } });

    const message = emails.customerCancelRequestToStaff({ customerName: customer.fullName, bookingRef: booking.refNo, reason, url: `${this.config.get("APP_URL")}/admin/bookings/${bookingId}` });
    const owner = booking.ownerId ? await this.prisma.user.findUnique({ where: { id: booking.ownerId }, select: { name: true, email: true } }) : null;
    if (owner) await this.mail.send({ ...message, to: owner.email, toName: owner.name, dedupeKey: `customer-cancel:${bookingId}:${owner.email}`, entityType: "Booking", entityId: bookingId });
    await this.mail.sendToStaff(["OPS_MANAGER"], () => ({ ...message, entityType: "Booking", entityId: bookingId }));
    return { requested: true };
  }

  // ─── Reviews ──────────────────────────────────────────────────────────────

  async getReview(actor: RequestUser, bookingId: string): Promise<TripReview | null> {
    this.customerId(actor);
    await this.bookings.findAccessible(actor, bookingId, "read");
    const t = await this.prisma.testimonial.findUnique({ where: { reviewBookingId: bookingId } });
    return t ? { rating: t.rating, comment: t.quote, submittedAt: toIso(t.createdAt)!, published: t.published } : null;
  }

  /** Saved as an unpublished testimonial: nothing reaches the website until staff approve it. */
  async submitReview(actor: RequestUser, bookingId: string, input: TripReviewInput): Promise<TripReview> {
    this.customerId(actor);
    const booking = await this.bookings.findAccessible(actor, bookingId, "read");
    if (booking.status !== "COMPLETED") throw AppError.conflict("You can review a trip once it's completed");
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: booking.customerId }, select: { fullName: true, city: true } });

    let created;
    try {
      created = await this.prisma.testimonial.create({
        data: { customerName: customer.fullName, location: customer.city, productType: booking.productType, rating: input.rating, quote: input.comment, published: false, reviewBookingId: bookingId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw AppError.conflict("You've already reviewed this trip");
      throw error;
    }
    await this.activities.record({ entityType: "CUSTOMER", entityId: booking.customerId, customerId: booking.customerId, type: "SYSTEM", body: `${customer.fullName} rated ${booking.refNo} ${input.rating}/5` });
    await this.mail.sendToStaff(["OPS_MANAGER"], () => ({
      ...emails.reviewToStaff({ customerName: customer.fullName, bookingRef: booking.refNo, rating: input.rating, comment: input.comment, url: `${this.config.get("APP_URL")}/admin/testimonials` }),
      entityType: "Booking",
      entityId: bookingId,
    }));
    return { rating: created.rating, comment: created.quote, submittedAt: toIso(created.createdAt)!, published: false };
  }
}
