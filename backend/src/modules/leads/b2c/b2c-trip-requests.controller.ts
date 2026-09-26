import { Body, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { leadInputSchema, leadListQuerySchema, type LeadData, type LeadListQuery } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { LeadsService } from "../domain/leads.service";

/** `/api/v1/b2c/trip-requests` — a customer asking Mashkoor to plan a new trip. */
@PortalController("b2c", "trip-requests")
export class B2CTripRequestsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(leadListQuerySchema)) query: LeadListQuery) {
    if (!actor.customerId) throw AppError.forbidden();
    return this.leads.list(actor, { ...query, customerId: actor.customerId });
  }

  @Get(":id")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.leads.get(actor, id);
  }

  @Post()
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(leadInputSchema)) body: LeadData) {
    return this.leads.createForCustomer(actor, body);
  }
}
