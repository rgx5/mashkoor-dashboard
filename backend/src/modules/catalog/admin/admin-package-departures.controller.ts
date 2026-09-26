import { Body, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { packageDepartureInputSchema, packageDepartureUpdateSchema, type PackageDepartureData, type PackageDepartureUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { RevalidatesSite } from "../../../core/site/revalidate.interceptor";
import { PackageDeparturesService } from "../domain/package-departures.service";
import { RequireFeatures } from "../../../core/features/require-features";

/** `/api/v1/admin/packages/:packageId/departures` — fixed dates + seats a package can be booked against directly. */
@RevalidatesSite("packages")
@PortalController("admin", "packages/:packageId/departures")
@RequireFeatures("website")
export class AdminPackageDeparturesController {
  constructor(private readonly departures: PackageDeparturesService) {}

  @Get()
  @CheckAbility("read", "Package")
  list(@CurrentUser() actor: RequestUser, @Param("packageId", ParseUUIDPipe) packageId: string) {
    return this.departures.list(actor, packageId);
  }

  @Post()
  @CheckAbility("update", "Package")
  create(@CurrentUser() actor: RequestUser, @Param("packageId", ParseUUIDPipe) packageId: string, @Body(new ZodPipe(packageDepartureInputSchema)) body: PackageDepartureData) {
    return this.departures.create(actor, packageId, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Package")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(packageDepartureUpdateSchema)) body: PackageDepartureUpdateData) {
    return this.departures.update(actor, id, body);
  }

  @Delete(":id")
  @CheckAbility("update", "Package")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.departures.remove(actor, id);
  }
}
