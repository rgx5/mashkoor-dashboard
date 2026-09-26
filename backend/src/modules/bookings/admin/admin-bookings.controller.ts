import { Body, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import {
  bookingCancelRequestSchema,
  bookingDeclineCancelSchema,
  bookingInputSchema,
  bookingItemInputSchema,
  bookingItemUpdateSchema,
  bookingListQuerySchema,
  bookingStatusChangeSchema,
  bookingUpdateSchema,
  type BookingCancelRequest,
  type BookingData,
  type BookingDeclineCancel,
  type BookingItemData,
  type BookingItemUpdateData,
  type BookingListQuery,
  type BookingStatusChange,
  type BookingUpdateData,
} from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { BookingsService } from "../domain/bookings.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `/api/v1/admin/bookings` — register, wizard, status workflow, cancellation. */
@PortalController("admin", "bookings")
@RequireFeatures("bookings")
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @CheckAbility("read", "Booking")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(bookingListQuerySchema)) query: BookingListQuery) {
    return this.bookings.list(actor, query);
  }

  @Get("export")
  @CheckAbility("read", "Booking")
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="bookings.csv"')
  async export(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(bookingListQuerySchema)) query: BookingListQuery, @Res({ passthrough: true }) res: Response) {
    const csv = await this.bookings.exportCsv(actor, query);
    res.send(csv);
  }

  @Get(":id")
  @CheckAbility("read", "Booking")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.bookings.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Booking")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(bookingInputSchema)) body: BookingData) {
    return this.bookings.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Booking")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(bookingUpdateSchema)) body: BookingUpdateData) {
    return this.bookings.update(actor, id, body);
  }

  @Post(":id/items")
  @CheckAbility("update", "Booking")
  addItem(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(bookingItemInputSchema)) body: BookingItemData) {
    return this.bookings.addItem(actor, id, body);
  }

  @Patch(":id/items/:itemId")
  @CheckAbility("update", "Booking")
  updateItem(
    @CurrentUser() actor: RequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body(new ZodPipe(bookingItemUpdateSchema)) body: BookingItemUpdateData,
  ) {
    return this.bookings.updateItem(actor, id, itemId, body);
  }

  @Delete(":id/items/:itemId")
  @CheckAbility("update", "Booking")
  removeItem(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.bookings.removeItem(actor, id, itemId);
  }

  @Post(":id/status")
  @HttpCode(200)
  @CheckAbility("update", "Booking")
  changeStatus(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(bookingStatusChangeSchema)) body: BookingStatusChange) {
    return this.bookings.changeStatus(actor, id, body);
  }

  /** Sales agents can't cancel work in progress — they ask, and a manager decides. Managers cancel via /status. */
  @Post(":id/cancel-request")
  @HttpCode(200)
  @CheckAbility("update", "Booking")
  requestCancellation(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(bookingCancelRequestSchema)) body: BookingCancelRequest) {
    return this.bookings.requestCancellation(actor, id, body.reason);
  }

  @Post(":id/cancel-request/decline")
  @HttpCode(200)
  @CheckAbility("manage", "Booking")
  declineCancellationRequest(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(bookingDeclineCancelSchema)) body: BookingDeclineCancel) {
    return this.bookings.declineCancellationRequest(actor, id, body.note);
  }
}
