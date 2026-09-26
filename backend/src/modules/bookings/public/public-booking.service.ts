import { Injectable, Logger } from "@nestjs/common";
import { type PublicDepartureBooking, type PublicDepartureBookingResult } from "@mashkoor/shared";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { AuditService } from "../../../core/audit/audit.service";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { InventoryAvailabilityService } from "../../inventory/domain/inventory-availability.service";
import { PaymentLinksService } from "../../payments/domain/payment-links.service";

const HOLD_HOURS = 2;

/**
 * A visitor books and pays for a fixed package departure straight from the website — no staff step to reserve the
 * seat or start the payment. The seat is held atomically (InventoryAvailabilityService), a Booking is created at
 * PENDING_PAYMENT, and the customer is sent to the same `/pay/:token` page a staff-issued link would use — nothing
 * new to build on the payment side. Staff still confirm the booking afterwards, same as every other channel.
 */
@Injectable()
export class PublicBookingService {
  private readonly logger = new Logger(PublicBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly inventory: InventoryAvailabilityService,
    private readonly paymentLinks: PaymentLinksService,
  ) {}

  async bookDeparture(slug: string, input: PublicDepartureBooking): Promise<PublicDepartureBookingResult> {
    // A double click or a network retry within the same minute reuses the first attempt's booking rather than
    // reserving two seats and charging twice.
    const minute = Math.floor(Date.now() / 60_000);
    const externalId = createHash("sha256").update(JSON.stringify([input.departureId, input.phone, input.travelerCount, minute])).digest("hex").slice(0, 40);
    try {
      const event = await this.prisma.inboundEvent.create({ data: { channel: "WEBSITE_BOOKING", externalId, payload: input as unknown as Prisma.InputJsonValue } });
      const result = await this.process(slug, input);
      await this.prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date() } });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.inboundEvent.findUnique({ where: { channel_externalId: { channel: "WEBSITE_BOOKING", externalId } } });
        if (existing?.status === "PROCESSED") throw AppError.conflict("This booking is already being processed — please wait a moment and check your email");
      }
      throw error;
    }
  }

  private async process(slug: string, input: PublicDepartureBooking): Promise<PublicDepartureBookingResult> {
    const pkg = await this.prisma.package.findFirst({ where: { slug, published: true } });
    if (!pkg) throw AppError.notFound("Package");
    const departure = await this.prisma.packageDeparture.findUnique({ where: { id: input.departureId } });
    if (!departure || departure.packageId !== pkg.id || !departure.active) throw AppError.notFound("Departure");
    if (departure.departureDate < new Date()) throw AppError.conflict("This departure has already left");

    const amountPerHead = departure.depositPerHead ?? departure.pricePerHead;
    const amountDue = amountPerHead * input.travelerCount;
    const totalSell = departure.pricePerHead * input.travelerCount;

    const { booking, customer } = await this.prisma.$transaction(async (tx) => {
      await this.inventory.reserveDeparture(tx, departure.id, input.travelerCount);

      const customer =
        (await tx.customer.findFirst({ where: { deletedAt: null, OR: [{ phone: input.phone }, { altPhone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] }, orderBy: { createdAt: "asc" } })) ??
        (await tx.customer.create({ data: { refNo: await this.sequences.next("customer", tx), fullName: input.contactName, phone: input.phone, email: input.email, source: "WEBSITE" } }));

      const booking = await tx.booking.create({
        data: {
          refNo: await this.sequences.next("booking", tx),
          customerId: customer.id,
          productType: pkg.productType,
          tripType: "GROUP_TOUR",
          status: "PENDING_PAYMENT",
          destination: pkg.title,
          travelFrom: departure.departureDate,
          travelTo: departure.returnDate,
          notes: input.notes,
          source: "WEBSITE",
          totalCost: 0,
          totalSell,
          items: {
            create: { type: "PACKAGE", description: pkg.title, packageId: pkg.id, packageDepartureId: departure.id, quantity: input.travelerCount, costPrice: 0, sellPrice: departure.pricePerHead },
          },
        },
      });
      await this.audit.record({ action: "booking.website_created", entityType: "Booking", entityId: booking.id, after: { source: "WEBSITE", packageSlug: slug, departureId: departure.id, travelerCount: input.travelerCount } }, tx);
      return { booking, customer };
    });

    const link = await this.paymentLinks.createForWebsiteBooking(booking.id, amountDue, HOLD_HOURS, "Website booking hold");

    if (customer.email) {
      await this.mail.send({ ...emails.paymentLink({ customerName: customer.fullName, amount: amountDue, bookingRef: booking.refNo, url: link.url, expiresAt: link.expiresAt }), to: customer.email, toName: customer.fullName, entityType: "Booking", entityId: booking.id });
    }
    await this.mail
      .sendToStaff(["OPS_MANAGER", "SUPER_ADMIN"], () =>
        emails.websiteBookingToStaff({ customerName: customer.fullName, bookingRef: booking.refNo, packageTitle: pkg.title, departureDate: departure.departureDate.toISOString(), travelerCount: input.travelerCount, amountDue, url: `${this.config.get("APP_URL")}/admin/bookings/${booking.id}` }),
      )
      .catch((error) => this.logger.warn(`Could not notify staff about website booking ${booking.refNo}: ${error instanceof Error ? error.message : error}`));

    return { bookingRef: booking.refNo, paymentUrl: link.url, amountDue, expiresAt: link.expiresAt };
  }
}
