import { Body, Get, Put } from "@nestjs/common";
import { companyProfileSchema, type CompanyProfile } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../core/auth/decorators";
import type { RequestUser } from "../../core/auth/request-user";
import { ZodPipe } from "../../core/http/zod.pipe";
import { CheckAbility } from "../../core/rbac/policies.guard";
import { CompanyService } from "./company.service";

/** `/api/v1/admin/company-profile` — the details printed on quotations. */
@PortalController("admin", "company-profile")
export class AdminCompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  @CheckAbility("update", "Setting")
  get() {
    return this.company.get();
  }

  @Put()
  @CheckAbility("update", "Setting")
  save(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(companyProfileSchema)) body: CompanyProfile) {
    return this.company.save(actor, body);
  }
}
