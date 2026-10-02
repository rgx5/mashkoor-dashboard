import { Body, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  enquiryAssignSchema,
  enquiryConvertSchema,
  enquiryInputSchema,
  enquiryListQuerySchema,
  enquiryStatusSchema,
  enquiryUpdateSchema,
  type EnquiryConvertData,
  type EnquiryData,
  type EnquiryListQuery,
  type EnquiryStatusChange,
  type EnquiryUpdateData,
} from "@mashkoor/shared";
import type { z } from "zod";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { EnquiriesService } from "../domain/enquiries.service";

const boardQuery = enquiryListQuerySchema.omit({ page: true, pageSize: true, sort: true, status: true });

/** `/api/v1/admin/enquiries` — raw enquiries: assign to a sales rep, log the call, convert to a lead. */
@PortalController("admin", "enquiries")
export class AdminEnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Get()
  @CheckAbility("read", "Enquiry")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(enquiryListQuerySchema)) query: EnquiryListQuery) {
    return this.enquiries.list(actor, query);
  }

  @Get("board")
  @CheckAbility("read", "Enquiry")
  board(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(boardQuery)) query: z.output<typeof boardQuery>) {
    return this.enquiries.board(actor, query);
  }

  @Get(":id")
  @CheckAbility("read", "Enquiry")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.enquiries.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Enquiry")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(enquiryInputSchema)) body: EnquiryData) {
    return this.enquiries.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Enquiry")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(enquiryUpdateSchema)) body: EnquiryUpdateData) {
    return this.enquiries.update(actor, id, body);
  }

  @Post(":id/assign")
  @HttpCode(200)
  @CheckAbility("read", "Enquiry")
  assign(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(enquiryAssignSchema)) body: { ownerId: string | null }) {
    return this.enquiries.assign(actor, id, body.ownerId);
  }

  @Post(":id/status")
  @HttpCode(200)
  @CheckAbility("update", "Enquiry")
  status(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(enquiryStatusSchema)) body: EnquiryStatusChange) {
    return this.enquiries.changeStatus(actor, id, body);
  }

  @Post(":id/convert")
  @HttpCode(200)
  @CheckAbility("update", "Enquiry")
  convert(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(enquiryConvertSchema)) body: EnquiryConvertData) {
    return this.enquiries.convert(actor, id, body);
  }
}
