import { Body, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { customerInputSchema, customerListQuerySchema, customerUpdateSchema, travelerInputSchema, type CustomerData, type CustomerListQuery, type CustomerUpdateData, type TravelerData } from "@mashkoor/shared";
import { z } from "zod";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CustomersService } from "../domain/customers.service";
import { TravelersService } from "../domain/travelers.service";

const createQuery = z.object({ allowDuplicate: z.enum(["true", "false"]).default("false") });

/**
 * `/api/v1/b2b/customers` — the agency's own customers and travellers. Reuses the same domain
 * services as Admin; the `Customer` CASL rule scoped to `partnerId` is what keeps agencies apart.
 */
@PortalController("b2b", "customers")
export class B2BCustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly travelers: TravelersService,
  ) {}

  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(customerListQuerySchema)) query: CustomerListQuery) {
    return this.customers.list(actor, query);
  }

  @Get(":id")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.customers.get(actor, id);
  }

  @Post()
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(customerInputSchema)) body: CustomerData, @Query(new ZodPipe(createQuery)) query: z.output<typeof createQuery>) {
    if (!actor.partnerId) throw AppError.forbidden();
    return this.customers.createAndGet(actor, body, query.allowDuplicate === "true", actor.partnerId);
  }

  @Patch(":id")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(customerUpdateSchema)) body: CustomerUpdateData) {
    return this.customers.update(actor, id, body);
  }

  @Post(":id/travelers")
  addTraveler(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(travelerInputSchema)) body: TravelerData) {
    return this.travelers.create(actor, id, body);
  }

  @Put(":id/travelers/:travelerId")
  updateTraveler(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Param("travelerId", ParseUUIDPipe) travelerId: string, @Body(new ZodPipe(travelerInputSchema)) body: TravelerData) {
    return this.travelers.update(actor, id, travelerId, body);
  }

  @Delete(":id/travelers/:travelerId")
  @HttpCode(204)
  removeTraveler(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Param("travelerId", ParseUUIDPipe) travelerId: string) {
    return this.travelers.remove(actor, id, travelerId);
  }
}
