import { Module } from "@nestjs/common";
import { AdminPaymentsController } from "./admin/admin-payments.controller";
import { PaymentLinksService } from "./domain/payment-links.service";
import { PaymentsService } from "./domain/payments.service";
import { MockPaymentGateway } from "./gateway/mock-gateway";
import { AdminPaymentLinksController, PaymentWebhookController, PublicPayController } from "./payment-links.controllers";

/** M11 · Payments: offline collections, payment links, and a mock gateway whose signed webhook credits bookings. */
@Module({
  controllers: [AdminPaymentsController, AdminPaymentLinksController, PublicPayController, PaymentWebhookController],
  providers: [PaymentsService, PaymentLinksService, MockPaymentGateway],
  exports: [PaymentsService, PaymentLinksService],
})
export class PaymentsModule {}
