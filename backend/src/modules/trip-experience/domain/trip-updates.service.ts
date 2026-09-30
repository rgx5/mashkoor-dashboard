import { Injectable } from "@nestjs/common";
import type { TripUpdateData, TripUpdateRow } from "@mashkoor/shared";
import { toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { BookingsService } from "../../bookings/domain/bookings.service";
import { CustomerAccountsService } from "../../customers/domain/customer-accounts.service";

const isStaff = (actor: RequestUser) => actor.portal === "admin";

/**
 * Updates staff post on a booking ("Visa submitted", "Hotel confirmed"). They appear on the customer's trip page and
 * in the agency's booking, and can be emailed at the same time.
 */
@Injectable()
export class TripUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly activities: ActivitiesService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly accounts: CustomerAccountsService,
  ) {}

  async list(actor: RequestUser, bookingId: string): Promise<TripUpdateRow[]> {
    await this.bookings.findAccessible(actor, bookingId, "read");
    const rows = await this.prisma.tripUpdate.findMany({ where: { bookingId }, include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((u) => ({ id: u.id, message: u.message, author: isStaff(actor) ? (u.createdBy?.name ?? "Staff") : "Mashkoor team", createdAt: toIso(u.createdAt)! }));
  }

  async post(actor: RequestUser, bookingId: string, input: TripUpdateData): Promise<TripUpdateRow> {
    if (!isStaff(actor)) throw AppError.forbidden();
    const booking = await this.bookings.findAccessible(actor, bookingId, "notify");
    const update = await this.prisma.tripUpdate.create({ data: { bookingId, message: input.message, createdById: actor.id }, include: { createdBy: { select: { name: true } } } });
    await this.activities.record({ entityType: "CUSTOMER", entityId: booking.customerId, customerId: booking.customerId, type: "SYSTEM", body: `Update shared on ${booking.refNo}: ${input.message}`, actorId: actor.id });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "trip.update_posted", entityType: "Booking", entityId: bookingId });
    if (input.notify) await this.notify(booking, input.message, update.id);
    return { id: update.id, message: update.message, author: update.createdBy?.name ?? "Staff", createdAt: toIso(update.createdAt)! };
  }

  async remove(actor: RequestUser, updateId: string) {
    if (!isStaff(actor)) throw AppError.forbidden();
    const update = await this.prisma.tripUpdate.findUnique({ where: { id: updateId } });
    if (!update) throw AppError.notFound("Update");
    await this.bookings.findAccessible(actor, update.bookingId, "notify");
    await this.prisma.tripUpdate.delete({ where: { id: updateId } });
  }

  /** Emails the customer, or the agency contact when an agency made the booking. Best effort. */
  private async notify(booking: { id: string; refNo: string; customerId: string; partnerId: string | null }, message: string, updateId: string) {
    if (booking.partnerId) {
      const partner = await this.prisma.partner.findUnique({ where: { id: booking.partnerId }, select: { contactName: true, email: true } });
      if (!partner) return;
      await this.mail.send({
        ...emails.tripUpdate({ recipientName: partner.contactName, bookingRef: booking.refNo, message, url: `${this.config.get("APP_URL")}/b2b/bookings/${booking.id}` }),
        to: partner.email,
        toName: partner.contactName,
        dedupeKey: `trip-update:${updateId}`,
        entityType: "Booking",
        entityId: booking.id,
      });
      return;
    }
    const customer = await this.prisma.customer.findUnique({ where: { id: booking.customerId }, select: { fullName: true, email: true } });
    if (!customer?.email) return;
    await this.accounts.ensureAccount(booking.customerId);
    await this.mail.send({
      ...emails.tripUpdate({ recipientName: customer.fullName, bookingRef: booking.refNo, message, url: `${this.config.get("APP_URL")}/b2c/trips/${booking.id}` }),
      to: customer.email,
      toName: customer.fullName,
      dedupeKey: `trip-update:${updateId}`,
      entityType: "Booking",
      entityId: booking.id,
    });
  }
}
