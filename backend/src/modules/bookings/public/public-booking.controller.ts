import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { publicDepartureBookingSchema, type PublicDepartureBooking } from "@mashkoor/shared";
import { Public } from "../../../core/auth/decorators";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { PublicBookingService } from "./public-booking.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `POST /api/v1/public/packages/:slug/book` — a visitor books and pays for a fixed departure directly. */
@ApiTags("public · bookings")
@Public()
@Controller("public/packages")
@RequireFeatures("website", "bookings", "payments")
export class PublicBookingController {
  constructor(private readonly bookings: PublicBookingService) {}

  @Post(":slug/book")
  @HttpCode(201)
  @Throttle({ default: { limit: 60, ttl: 60 * 60_000 } })
  book(@Param("slug") slug: string, @Body(new ZodPipe(publicDepartureBookingSchema)) body: PublicDepartureBooking) {
    return this.bookings.bookDeparture(slug, body);
  }
}
