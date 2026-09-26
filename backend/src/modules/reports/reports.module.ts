import { Get, Module, Param, Query } from "@nestjs/common";
import { REPORT_NAMES, reportQuerySchema, type ReportName, type ReportQuery } from "@mashkoor/shared";
import { z } from "zod";
import { CurrentUser, PortalController } from "../../core/auth/decorators";
import type { RequestUser } from "../../core/auth/request-user";
import { ZodPipe } from "../../core/http/zod.pipe";
import { ReportsService } from "./reports.service";

const nameSchema = z.enum(REPORT_NAMES);

/** `/api/v1/admin/reports/:name?from=&to=` — each report enforces its own permissions. */
@PortalController("admin", "reports")
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(":name")
  run(@CurrentUser() actor: RequestUser, @Param("name", new ZodPipe(nameSchema)) name: ReportName, @Query(new ZodPipe(reportQuerySchema)) query: ReportQuery) {
    return this.reports.run(actor, name, query);
  }
}

/** M14 · Reports: sales register, receivables ageing, daybook, lead sources, staff performance. */
@Module({ controllers: [AdminReportsController], providers: [ReportsService] })
export class ReportsModule {}
