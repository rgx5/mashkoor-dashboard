import { RequireFeatures } from "../../../core/features/require-features";
import { Body, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import {
  documentListQuerySchema,
  documentUploadQuerySchema,
  documentVisibilitySchema,
  tripUpdateInputSchema,
  tripUpdateListQuerySchema,
  MAX_DOCUMENT_BYTES,
  type DocumentListQuery,
  type DocumentUploadQuery,
  type TripUpdateData,
  type TripUpdateListQuery,
} from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { sendFile } from "../../../core/http/send-file";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { BookingDocumentsService } from "../domain/booking-documents.service";
import { TripUpdatesService } from "../domain/trip-updates.service";

/** `/api/v1/admin/trip-updates` — messages staff post on a booking for the customer/agency to see. */
@PortalController("admin", "trip-updates")
@RequireFeatures("bookings")
export class AdminTripUpdatesController {
  constructor(private readonly updates: TripUpdatesService) {}

  @Get()
  @CheckAbility("read", "Booking")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(tripUpdateListQuerySchema)) query: TripUpdateListQuery) {
    return this.updates.list(actor, query.bookingId);
  }

  @Post()
  @CheckAbility("notify", "Booking")
  post(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(tripUpdateInputSchema)) body: TripUpdateData) {
    return this.updates.post(actor, body.bookingId, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @CheckAbility("notify", "Booking")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.updates.remove(actor, id);
  }
}

/** `/api/v1/admin/documents` — visas, tickets, vouchers staff attach to a booking. */
@PortalController("admin", "documents")
@RequireFeatures("bookings")
export class AdminDocumentsController {
  constructor(private readonly documents: BookingDocumentsService) {}

  @Get()
  @CheckAbility("read", "Booking")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(documentListQuerySchema)) query: DocumentListQuery) {
    return this.documents.list(actor, query.bookingId);
  }

  /** Every document across every booking this customer has — feeds the Documents tab on Customer 360. */
  @Get("customer/:customerId")
  @CheckAbility("read", "Customer")
  listForCustomer(@CurrentUser() actor: RequestUser, @Param("customerId", ParseUUIDPipe) customerId: string) {
    return this.documents.listForCustomer(actor, customerId);
  }

  @Post()
  @CheckAbility("attach", "Booking")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  upload(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodPipe(documentUploadQuerySchema)) query: DocumentUploadQuery,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw AppError.notFound("File");
    return this.documents.upload(actor, query.bookingId, query, file.buffer);
  }

  @Get(":id/download")
  @CheckAbility("read", "Booking")
  async download(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.documents.download(actor, id);
    return sendFile(res, file);
  }

  @Patch(":id/visibility")
  @HttpCode(200)
  @CheckAbility("attach", "Booking")
  setVisibility(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(documentVisibilitySchema)) body: { visibleToCustomer: boolean }) {
    return this.documents.setVisibility(actor, id, body.visibleToCustomer);
  }

  @Delete(":id")
  @HttpCode(204)
  @CheckAbility("attach", "Booking")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.documents.remove(actor, id);
  }
}
