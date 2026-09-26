import { RequireFeatures } from "../../../core/features/require-features";
import { Body, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { bookingCancelRequestSchema, itineraryChangesSchema, tripReviewSchema, type BookingCancelRequest, type TripReviewInput } from "@mashkoor/shared";
import type { Response } from "express";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { sendFile } from "../../../core/http/send-file";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { ItinerariesService } from "../../itineraries/domain/itineraries.service";
import { BookingDocumentsService } from "../domain/booking-documents.service";
import { CustomerPortalService } from "../domain/customer-portal.service";
import { TripUpdatesService } from "../domain/trip-updates.service";

/** `/api/v1/b2c/home` — "what needs you" for the signed-in customer. */
@PortalController("b2c", "home")
export class B2CHomeController {
  constructor(private readonly portal: CustomerPortalService) {}

  @Get()
  home(@CurrentUser() actor: RequestUser) {
    return this.portal.home(actor);
  }
}

/** `/api/v1/b2c/trips/:id/...` — the customer's own view of one trip: timeline, updates, documents, cancel, review. */
@PortalController("b2c", "trips")
@RequireFeatures("bookings")
export class B2CTripExperienceController {
  constructor(
    private readonly portal: CustomerPortalService,
    private readonly updates: TripUpdatesService,
    private readonly documents: BookingDocumentsService,
  ) {}

  @Get(":id/timeline")
  timeline(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.portal.timeline(actor, id);
  }

  @Get(":id/updates")
  updates_(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.updates.list(actor, id);
  }

  @Get(":id/documents")
  documents_(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.documents.list(actor, id);
  }

  @Get(":id/documents/:documentId/download")
  async download(@CurrentUser() actor: RequestUser, @Param("documentId", ParseUUIDPipe) documentId: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.documents.download(actor, documentId);
    return sendFile(res, file);
  }

  @Post(":id/cancel-request")
  @HttpCode(200)
  cancelRequest(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(bookingCancelRequestSchema)) body: BookingCancelRequest) {
    return this.portal.requestCancellation(actor, id, body.reason);
  }

  @Get(":id/review")
  getReview(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.portal.getReview(actor, id);
  }

  @Post(":id/review")
  @HttpCode(200)
  submitReview(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(tripReviewSchema)) body: TripReviewInput) {
    return this.portal.submitReview(actor, id, body);
  }
}

/** `/api/v1/b2c/itineraries/:id/request-changes` — the customer asks for the plan to be revised. */
@PortalController("b2c", "itineraries")
@RequireFeatures("quotations")
export class B2CItineraryChangesController {
  constructor(private readonly itineraries: ItinerariesService) {}

  @Post(":id/request-changes")
  @HttpCode(200)
  requestChanges(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(itineraryChangesSchema)) body: { message: string }) {
    return this.itineraries.requestChangesFromCustomer(actor, id, body.message);
  }
}
