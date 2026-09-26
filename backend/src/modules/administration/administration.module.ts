import { Module } from "@nestjs/common";
import { CustomersModule } from "../customers/customers.module";
import { InventoryModule } from "../inventory/inventory.module";
import { LeadsModule } from "../leads/leads.module";
import { PaymentsModule } from "../payments/payments.module";
import { AdminAuditController, AdminImportController, AdminIntegrationsController, AdminNotificationsController } from "./admin/administration.controllers";
import { AdminToolsService } from "./domain/admin-tools.service";
import { ImportService } from "./domain/import.service";
import { JobsService } from "./domain/jobs.service";

/** M12 + M15 · Email log, integrations, audit viewer, CSV import and the scheduled jobs. */
@Module({
  imports: [CustomersModule, LeadsModule, PaymentsModule, InventoryModule],
  controllers: [AdminNotificationsController, AdminIntegrationsController, AdminAuditController, AdminImportController],
  providers: [AdminToolsService, ImportService, JobsService],
})
export class AdministrationModule {}
