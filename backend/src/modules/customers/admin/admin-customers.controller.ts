import { Body, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import {
  customerInputSchema,
  customerListQuerySchema,
  customerUpdateSchema,
  mergeCustomersSchema,
  travelerInputSchema,
  type CustomerData,
  type CustomerListQuery,
  type CustomerUpdateData,
  type TravelerData,
} from "@mashkoor/shared";
import { z } from "zod";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { RequireFeatures } from "../../../core/features/require-features";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { CustomerAccountsService } from "../domain/customer-accounts.service";
import { CustomersService } from "../domain/customers.service";
import { TravelersService } from "../domain/travelers.service";

const lookupQuery = z.object({ phone: z.string().max(30).optional(), email: z.string().max(200).optional(), excludeId: z.uuid().optional() });
const createQuery = z.object({ allowDuplicate: z.enum(["true", "false"]).default("false") });

/** `/api/v1/admin/customers` — Customer 360, travellers, merge. */
@PortalController("admin", "customers")
export class AdminCustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly travelers: TravelersService,
    private readonly activities: ActivitiesService,
    private readonly accounts: CustomerAccountsService,
  ) {}

  @Get()
  @CheckAbility("read", "Customer")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(customerListQuerySchema)) query: CustomerListQuery) {
    return this.customers.list(actor, query);
  }

  /** Duplicate check while typing a phone or email in the create forms. */
  @Get("lookup")
  @CheckAbility("read", "Customer")
  lookup(@Query(new ZodPipe(lookupQuery)) query: z.output<typeof lookupQuery>) {
    return this.customers.findDuplicates(query.phone, query.email, query.excludeId);
  }

  @Get(":id")
  @CheckAbility("read", "Customer")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.get(actor, id);
  }

  @Get(":id/timeline")
  @CheckAbility("read", "Customer")
  timeline(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.activities.listForEntity(actor, "CUSTOMER", id, 200);
  }

  /** Whether this customer can sign in to /b2c, and how. */
  @Get(":id/portal-access")
  @RequireFeatures("portal")
  @CheckAbility("read", "Customer")
  portalAccess(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.accounts.info(actor, id);
  }

  /** Creates the login if needed and (re)sends the welcome email. */
  @Post(":id/portal-access/invite")
  @RequireFeatures("portal")
  @HttpCode(200)
  @CheckAbility("update", "Customer")
  invitePortalAccess(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.accounts.invite(actor, id);
  }

  @Post()
  @CheckAbility("create", "Customer")
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodPipe(customerInputSchema)) body: CustomerData,
    @Query(new ZodPipe(createQuery)) query: z.output<typeof createQuery>,
  ) {
    return this.customers.createAndGet(actor, body, query.allowDuplicate === "true");
  }

  @Patch(":id")
  @CheckAbility("update", "Customer")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(customerUpdateSchema)) body: CustomerUpdateData) {
    return this.customers.update(actor, id, body);
  }

  @Post(":id/merge")
  @HttpCode(200)
  @CheckAbility("merge", "Customer")
  merge(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(mergeCustomersSchema)) body: { duplicateId: string }) {
    return this.customers.merge(actor, id, body.duplicateId);
  }

  @Delete(":id")
  @HttpCode(204)
  @CheckAbility("delete", "Customer")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.remove(actor, id);
  }

  // ─── Travellers ───

  @Post(":id/travelers")
  @CheckAbility("create", "Traveler")
  addTraveler(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(travelerInputSchema)) body: TravelerData) {
    return this.travelers.create(actor, id, body);
  }

  @Put(":id/travelers/:travelerId")
  @CheckAbility("update", "Traveler")
  updateTraveler(
    @CurrentUser() actor: RequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("travelerId", ParseUUIDPipe) travelerId: string,
    @Body(new ZodPipe(travelerInputSchema)) body: TravelerData,
  ) {
    return this.travelers.update(actor, id, travelerId, body);
  }

  @Delete(":id/travelers/:travelerId")
  @HttpCode(204)
  @CheckAbility("delete", "Traveler")
  removeTraveler(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Param("travelerId", ParseUUIDPipe) travelerId: string) {
    return this.travelers.remove(actor, id, travelerId);
  }

  @Post(":id/travelers/:travelerId/reveal-passport")
  @HttpCode(200)
  @CheckAbility("reveal", "Traveler")
  revealPassport(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Param("travelerId", ParseUUIDPipe) travelerId: string) {
    return this.travelers.revealPassport(actor, id, travelerId);
  }
}
