import { RequireFeatures } from "../../../core/features/require-features";
import { Body, Get, Param, ParseUUIDPipe, Patch, Post, Query, Delete } from "@nestjs/common";
import { packageInputSchema, packageListQuerySchema, packageUpdateSchema, type PackageData, type PackageListQuery, type PackageUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { PackagesService } from "../domain/packages.service";
import { RevalidatesSite } from "../../../core/site/revalidate.interceptor";

/** `/api/v1/admin/packages` */
@RevalidatesSite("packages")
@PortalController("admin", "packages")
@RequireFeatures("website")
export class AdminPackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  @CheckAbility("read", "Package")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(packageListQuerySchema)) query: PackageListQuery) {
    return this.packages.list(actor, query);
  }

  @Get(":id")
  @CheckAbility("read", "Package")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.packages.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Package")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(packageInputSchema)) body: PackageData) {
    return this.packages.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Package")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(packageUpdateSchema)) body: PackageUpdateData) {
    return this.packages.update(actor, id, body);
  }

  @Delete(":id")
  @CheckAbility("delete", "Package")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.packages.remove(actor, id);
  }
}
