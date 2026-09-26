import { RequireFeatures } from "../../../core/features/require-features";
import { Body, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { bookingCancelRequestSchema, bookingInputSchema, bookingListQuerySchema, type BookingCancelRequest, type BookingData, type BookingListQuery } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { BookingsService } from "../domain/bookings.service";

/**
 * `/api/v1/b2b/bookings` — the agency's own bookings: submit, track, cancel.
 * There is deliberately no generic status endpoint here: a partner can raise or cancel a booking, but only
 * Mashkoor's staff can approve or confirm one (that is what debits the wallet).
 */
@PortalController("b2b", "bookings")
@RequireFeatures("bookings")
export class B2BBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(bookingListQuerySchema)) query: BookingListQuery) {
    return this.bookings.list(actor, query);
  }

  @Get(":id")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.get(actor, id);
  }

  @Post()
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(bookingInputSchema)) body: BookingData) {
    return this.bookings.createForPartner(actor, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(bookingCancelRequestSchema)) body: BookingCancelRequest) {
    return this.bookings.requestCancellation(actor, id, body.reason);
  }
}
