import { RequireFeatures } from "../../../core/features/require-features";
import { Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { bookingListQuerySchema, type BookingListQuery } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { PaymentLinksService } from "../../payments/domain/payment-links.service";
import { PaymentsService } from "../../payments/domain/payments.service";
import { BookingsService } from "../domain/bookings.service";

/** `/api/v1/b2c/trips` — the customer's own bookings and what they owe. */
@PortalController("b2c", "trips")
@RequireFeatures("bookings")
export class B2CTripsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly paymentsService: PaymentsService,
    private readonly paymentLinks: PaymentLinksService,
  ) {}

  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(bookingListQuerySchema)) query: BookingListQuery) {
    if (!actor.customerId) throw AppError.forbidden();
    return this.bookings.list(actor, { ...query, customerId: actor.customerId });
  }

  @Get(":id")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.get(actor, id);
  }

  @Get(":id/payments")
  payments(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.paymentsService.summaryForBooking(actor, id);
  }

  /** "Pay now": returns a payment link for the balance due (reusing an unexpired one). */
  @Post(":id/pay")
  @HttpCode(200)
  pay(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.paymentLinks.createForCustomer(actor, id);
  }
}
