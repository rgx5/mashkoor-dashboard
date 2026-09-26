import { Body, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { paymentInputSchema, paymentListQuerySchema, paymentRejectSchema, type PaymentData, type PaymentListQuery } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { PaymentsService } from "../domain/payments.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `/api/v1/admin/payments` — offline collections: record, verify, reject. */
@PortalController("admin", "payments")
@RequireFeatures("payments")
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(paymentListQuerySchema)) query: PaymentListQuery) {
    return this.payments.list(actor, query);
  }

  @Get("booking/:bookingId/summary")
  summary(@CurrentUser() actor: RequestUser, @Param("bookingId", ParseUUIDPipe) bookingId: string) {
    return this.payments.summaryForBooking(actor, bookingId);
  }

  @Post()
  record(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(paymentInputSchema)) body: PaymentData) {
    return this.payments.record(actor, body);
  }

  @Post(":id/verify")
  verify(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.payments.verify(actor, id);
  }

  @Post(":id/reject")
  reject(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(paymentRejectSchema)) body: { reason: string }) {
    return this.payments.reject(actor, id, body.reason);
  }
}
