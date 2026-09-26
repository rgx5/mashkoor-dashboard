import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Headers } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { mockCheckoutSchema, paymentLinkInputSchema, type MockCheckoutInput, type PaymentLinkData } from "@mashkoor/shared";
import { z } from "zod";
import { CurrentUser, Public, PortalController } from "../../core/auth/decorators";
import type { RequestUser } from "../../core/auth/request-user";
import { AppError } from "../../core/http/app-error";
import { ZodPipe } from "../../core/http/zod.pipe";
import { PaymentLinksService } from "./domain/payment-links.service";
import type { GatewayEvent } from "./gateway/mock-gateway";
import { RequireFeatures } from "../../core/features/require-features";

const bookingQuery = z.object({ bookingId: z.uuid() });

/** `/api/v1/admin/payment-links` — create, list, cancel and email payment links for a booking. */
@PortalController("admin", "payment-links")
@RequireFeatures("payments")
export class AdminPaymentLinksController {
  constructor(private readonly links: PaymentLinksService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(bookingQuery)) query: z.output<typeof bookingQuery>) {
    return this.links.listForBooking(actor, query.bookingId);
  }

  @Post()
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(paymentLinkInputSchema)) body: PaymentLinkData) {
    return this.links.create(actor, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.links.cancel(actor, id);
  }

  @Post(":id/send")
  @HttpCode(200)
  send(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.links.sendToCustomer(actor, id);
  }
}

/** `/api/v1/public/pay/:token` — what the customer's browser talks to. The token is the only credential. */
@ApiTags("public · payments")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller("public/pay")
@RequireFeatures("payments")
export class PublicPayController {
  constructor(private readonly links: PaymentLinksService) {}

  @Get(":token")
  view(@Param("token") token: string) {
    return this.links.view(token);
  }

  @Post(":token/checkout")
  @HttpCode(200)
  checkout(@Param("token") token: string) {
    return this.links.startCheckout(token);
  }

  /** Test gateway only: stands in for the gateway's own checkout page and webhook delivery. */
  @Post(":token/mock-complete")
  @HttpCode(200)
  mockComplete(@Param("token") token: string, @Body(new ZodPipe(mockCheckoutSchema)) body: MockCheckoutInput) {
    return this.links.mockComplete(token, body);
  }
}

const eventSchema = z.object({
  eventId: z.string().min(1).max(80),
  type: z.enum(["payment.captured", "payment.failed"]),
  orderId: z.string().min(1).max(80),
  paymentId: z.string().min(1).max(80),
  amount: z.number().int().min(1),
  method: z.string().max(40),
});

/** `POST /api/v1/webhooks/payments/:provider` — where a gateway reports results. Trusted only via its signature. */
@ApiTags("webhooks")
@Public()
@Controller("webhooks/payments")
@RequireFeatures("payments")
export class PaymentWebhookController {
  constructor(private readonly links: PaymentLinksService) {}

  @Post(":provider")
  @HttpCode(200)
  receive(@Param("provider") provider: string, @Headers("x-gateway-signature") signature: string | undefined, @Body(new ZodPipe(eventSchema)) event: GatewayEvent) {
    if (provider !== "mock") throw AppError.notFound("Gateway");
    return this.links.handleGatewayEvent(event, signature ?? "");
  }
}
