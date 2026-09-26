import { RequireFeatures } from "../../core/features/require-features";
import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Module, Res, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  itineraryAcceptSchema,
  itineraryInputSchema,
  itineraryListQuerySchema,
  itineraryShareSchema,
  itineraryUpdateSchema,
  type ItineraryData,
  type ItineraryListQuery,
  type ItineraryShareInput,
  type ItineraryUpdateData,
} from "@mashkoor/shared";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser, Public, PortalController } from "../../core/auth/decorators";
import type { RequestUser } from "../../core/auth/request-user";
import { ZodPipe } from "../../core/http/zod.pipe";
import { CheckAbility } from "../../core/rbac/policies.guard";
import { ActivitiesModule } from "../activities/activities.module";
import { BookingsModule } from "../bookings/bookings.module";
import { CustomersModule } from "../customers/customers.module";
import { CompanyModule } from "../company/company.module";
import { ItinerariesService } from "./domain/itineraries.service";
import { QuotationPdfService } from "./domain/quotation-pdf.service";

const duplicateSchema = z.object({ customerId: z.uuid().nullable().optional(), leadId: z.uuid().nullable().optional() });

/** `/api/v1/admin/itineraries` — build, share, and convert trip plans. */
@PortalController("admin", "itineraries")
@RequireFeatures("quotations")
export class AdminItinerariesController {
  constructor(
    private readonly itineraries: ItinerariesService,
    private readonly quotations: QuotationPdfService,
  ) {}

  @Get()
  @CheckAbility("read", "Itinerary")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(itineraryListQuerySchema)) query: ItineraryListQuery) {
    return this.itineraries.list(actor, query);
  }

  @Get(":id/pdf")
  @CheckAbility("read", "Itinerary")
  async pdf(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.quotations.render(actor, id);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.fileName}"` });
    return new StreamableFile(file.data);
  }

  @Get(":id")
  @CheckAbility("read", "Itinerary")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.itineraries.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Itinerary")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(itineraryInputSchema)) body: ItineraryData) {
    return this.itineraries.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Itinerary")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(itineraryUpdateSchema)) body: ItineraryUpdateData) {
    return this.itineraries.update(actor, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @CheckAbility("delete", "Itinerary")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.itineraries.remove(actor, id);
  }

  @Post(":id/duplicate")
  @CheckAbility("create", "Itinerary")
  duplicate(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(duplicateSchema)) body: z.output<typeof duplicateSchema>) {
    return this.itineraries.duplicate(actor, id, body);
  }

  @Post(":id/share")
  @HttpCode(200)
  @CheckAbility("update", "Itinerary")
  share(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(itineraryShareSchema)) body: ItineraryShareInput) {
    return this.itineraries.share(actor, id, body.validForDays);
  }

  @Post(":id/unshare")
  @HttpCode(200)
  @CheckAbility("update", "Itinerary")
  unshare(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.itineraries.unshare(actor, id);
  }

  @Post(":id/send")
  @HttpCode(200)
  @CheckAbility("update", "Itinerary")
  send(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.itineraries.sendToCustomer(actor, id);
  }

  @Post(":id/convert")
  @HttpCode(200)
  @CheckAbility("update", "Itinerary")
  convert(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.itineraries.convertToBooking(actor, id);
  }
}

/** `/api/v1/public/itineraries/:token` — the customer's shared link. The token is the only credential. */
@ApiTags("public · itineraries")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller("public/itineraries")
@RequireFeatures("quotations")
export class PublicItinerariesController {
  constructor(private readonly itineraries: ItinerariesService) {}

  @Get(":token")
  view(@Param("token") token: string) {
    return this.itineraries.viewByToken(token);
  }

  @Post(":token/accept")
  @HttpCode(200)
  accept(@Param("token") token: string, @Body(new ZodPipe(itineraryAcceptSchema)) body: { name: string }) {
    return this.itineraries.acceptByToken(token, body.name);
  }
}

/** `/api/v1/b2c/itineraries` — trip plans shared with the signed-in customer. */
@PortalController("b2c", "itineraries")
@RequireFeatures("quotations")
export class B2CItinerariesController {
  constructor(private readonly itineraries: ItinerariesService) {}

  @Get()
  list(@CurrentUser() actor: RequestUser) {
    return this.itineraries.listForCustomer(actor);
  }
}

/** M10 · Itineraries. */
@Module({
  imports: [ActivitiesModule, CustomersModule, BookingsModule, CompanyModule],
  controllers: [AdminItinerariesController, PublicItinerariesController, B2CItinerariesController],
  providers: [ItinerariesService, QuotationPdfService],
  exports: [ItinerariesService],
})
export class ItinerariesModule {}
