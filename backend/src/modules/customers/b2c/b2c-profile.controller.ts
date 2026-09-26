import { Body, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from "@nestjs/common";
import { customerUpdateSchema, travelerInputSchema, type CustomerUpdateData, type TravelerData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CustomersService } from "../domain/customers.service";
import { TravelersService } from "../domain/travelers.service";

/** `/api/v1/b2c/profile` — the customer's own details and family travellers. Owner/source/tags aren't editable here. */
// The email address is the customer's sign-in identity, so only staff change it (see CustomersService.update).
const editableFields = customerUpdateSchema.pick({ fullName: true, altPhone: true, whatsappOptIn: true, preferredChannel: true, city: true, state: true });

@PortalController("b2c", "profile")
export class B2CProfileController {
  constructor(
    private readonly customers: CustomersService,
    private readonly travelers: TravelersService,
  ) {}

  @Get()
  get(@CurrentUser() actor: RequestUser) {
    if (!actor.customerId) throw AppError.forbidden();
    return this.customers.get(actor, actor.customerId);
  }

  @Patch()
  update(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(editableFields)) body: CustomerUpdateData) {
    if (!actor.customerId) throw AppError.forbidden();
    return this.customers.update(actor, actor.customerId, body);
  }

  @Post("travelers")
  addTraveler(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(travelerInputSchema)) body: TravelerData) {
    if (!actor.customerId) throw AppError.forbidden();
    return this.travelers.create(actor, actor.customerId, body);
  }

  @Put("travelers/:travelerId")
  updateTraveler(@CurrentUser() actor: RequestUser, @Param("travelerId", ParseUUIDPipe) travelerId: string, @Body(new ZodPipe(travelerInputSchema)) body: TravelerData) {
    if (!actor.customerId) throw AppError.forbidden();
    return this.travelers.update(actor, actor.customerId, travelerId, body);
  }

  @Delete("travelers/:travelerId")
  @HttpCode(204)
  removeTraveler(@CurrentUser() actor: RequestUser, @Param("travelerId", ParseUUIDPipe) travelerId: string) {
    if (!actor.customerId) throw AppError.forbidden();
    return this.travelers.remove(actor, actor.customerId, travelerId);
  }
}
