import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { CompanyModule } from "../company/company.module";
import { AdminInvoicesController } from "./admin/admin-invoices.controller";
import { InvoicePdfService } from "./domain/invoice-pdf.service";
import { InvoicesService } from "./domain/invoices.service";

/** Invoices raised by the accountant from an accepted quotation, with a payment entry for every payment made. */
@Module({
  imports: [ActivitiesModule, CompanyModule],
  controllers: [AdminInvoicesController],
  providers: [InvoicesService, InvoicePdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
