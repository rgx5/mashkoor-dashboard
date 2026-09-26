import { Body, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  hotelInputSchema,
  hotelListQuerySchema,
  hotelUpdateSchema,
  ratePeriodInputSchema,
  ratePeriodUpdateSchema,
  roomTypeInputSchema,
  roomTypeUpdateSchema,
  type HotelData,
  type HotelListQuery,
  type HotelUpdateData,
  type RatePeriodData,
  type RatePeriodUpdateData,
  type RoomTypeData,
  type RoomTypeUpdateData,
} from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { HotelsService } from "../domain/hotels.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `/api/v1/admin/hotels` — hotels, plus nested room types and rate periods. */
@PortalController("admin", "hotels")
@RequireFeatures("bookings")
export class AdminHotelsController {
  constructor(private readonly hotels: HotelsService) {}

  @Get()
  @CheckAbility("read", "Hotel")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(hotelListQuerySchema)) query: HotelListQuery) {
    return this.hotels.list(actor, query);
  }

  @Get(":id")
  @CheckAbility("read", "Hotel")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.hotels.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Hotel")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(hotelInputSchema)) body: HotelData) {
    return this.hotels.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Hotel")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(hotelUpdateSchema)) body: HotelUpdateData) {
    return this.hotels.update(actor, id, body);
  }

  @Delete(":id")
  @CheckAbility("delete", "Hotel")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.hotels.remove(actor, id);
  }

  @Post("room-types")
  @CheckAbility("create", "RoomType")
  createRoomType(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(roomTypeInputSchema)) body: RoomTypeData) {
    return this.hotels.createRoomType(actor, body);
  }

  @Patch("room-types/:id")
  @CheckAbility("update", "RoomType")
  updateRoomType(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(roomTypeUpdateSchema)) body: RoomTypeUpdateData) {
    return this.hotels.updateRoomType(actor, id, body);
  }

  @Delete("room-types/:id")
  @CheckAbility("delete", "RoomType")
  removeRoomType(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.hotels.removeRoomType(actor, id);
  }

  @Post("rate-periods")
  @CheckAbility("create", "RatePeriod")
  createRatePeriod(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(ratePeriodInputSchema)) body: RatePeriodData) {
    return this.hotels.createRatePeriod(actor, body);
  }

  @Patch("rate-periods/:id")
  @CheckAbility("update", "RatePeriod")
  updateRatePeriod(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(ratePeriodUpdateSchema)) body: RatePeriodUpdateData) {
    return this.hotels.updateRatePeriod(actor, id, body);
  }

  @Delete("rate-periods/:id")
  @CheckAbility("delete", "RatePeriod")
  removeRatePeriod(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.hotels.removeRatePeriod(actor, id);
  }
}
