import { Get } from "@nestjs/common";
import { CurrentUser, PortalController } from "../../core/auth/decorators";
import type { RequestUser } from "../../core/auth/request-user";
import { DashboardService } from "./domain/dashboard.service";

/** `/api/v1/admin/dashboard` */
@PortalController("admin", "dashboard")
export class AdminDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@CurrentUser() actor: RequestUser) {
    return this.dashboard.admin(actor);
  }
}

/** `/api/v1/b2b/dashboard` */
@PortalController("b2b", "dashboard")
export class B2BDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@CurrentUser() actor: RequestUser) {
    return this.dashboard.b2b(actor);
  }
}

/** `/api/v1/b2c/dashboard` */
@PortalController("b2c", "dashboard")
export class B2CDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@CurrentUser() actor: RequestUser) {
    return this.dashboard.b2c(actor);
  }
}
