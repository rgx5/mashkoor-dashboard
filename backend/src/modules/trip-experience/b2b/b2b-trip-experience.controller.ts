import { RequireFeatures } from "../../../core/features/require-features";
import { Get, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { sendFile } from "../../../core/http/send-file";
import { BookingDocumentsService } from "../domain/booking-documents.service";
import { TripUpdatesService } from "../domain/trip-updates.service";

/** `/api/v1/b2b/bookings/:id/...` — an agency's read-only view of updates and documents on its own booking. */
@PortalController("b2b", "bookings")
@RequireFeatures("bookings")
export class B2BTripExperienceController {
  constructor(
    private readonly updates: TripUpdatesService,
    private readonly documents: BookingDocumentsService,
  ) {}

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
}
