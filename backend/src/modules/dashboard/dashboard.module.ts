import { Module } from "@nestjs/common";
import { AdminDashboardController, B2BDashboardController, B2CDashboardController } from "./dashboard.controllers";
import { DashboardService } from "./domain/dashboard.service";

/** M14 · Dashboards: KPI summaries for the Admin, B2B and B2C home pages. */
@Module({
  controllers: [AdminDashboardController, B2BDashboardController, B2CDashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
