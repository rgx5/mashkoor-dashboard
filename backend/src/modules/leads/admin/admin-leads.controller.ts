import { Body, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import {
  leadAccountantSchema,
  leadAssignSchema,
  leadBulkSchema,
  leadConvertSchema,
  leadInputSchema,
  leadListQuerySchema,
  leadStageChangeSchema,
  leadUpdateSchema,
  type LeadData,
  type LeadListQuery,
  type LeadStageChange,
  type LeadUpdateData,
} from "@mashkoor/shared";
import type { z } from "zod";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { LeadsService } from "../domain/leads.service";

const boardQuery = leadListQuerySchema.omit({ page: true, pageSize: true, sort: true, stage: true });

/** `/api/v1/admin/leads` — pipeline board, list, detail and stage workflow. */
@PortalController("admin", "leads")
export class AdminLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @CheckAbility("read", "Lead")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(leadListQuerySchema)) query: LeadListQuery) {
    return this.leads.list(actor, query);
  }

  @Get("board")
  @CheckAbility("read", "Lead")
  board(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(boardQuery)) query: z.output<typeof boardQuery>) {
    return this.leads.board(actor, query);
  }

  @Get(":id")
  @CheckAbility("read", "Lead")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.leads.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Lead")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(leadInputSchema)) body: LeadData) {
    return this.leads.create(actor, body);
  }

  @Post("bulk")
  @HttpCode(200)
  @CheckAbility("update", "Lead")
  bulk(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(leadBulkSchema)) body: z.output<typeof leadBulkSchema>) {
    return this.leads.bulkUpdate(actor, body.ids, { ownerId: body.ownerId, priority: body.priority });
  }

  @Patch(":id")
  @CheckAbility("update", "Lead")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(leadUpdateSchema)) body: LeadUpdateData) {
    return this.leads.update(actor, id, body);
  }

  @Post(":id/stage")
  @HttpCode(200)
  @CheckAbility("update", "Lead")
  changeStage(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(leadStageChangeSchema)) body: LeadStageChange) {
    return this.leads.changeStage(actor, id, body);
  }

  @Post(":id/assign")
  @HttpCode(200)
  @CheckAbility("read", "Lead")
  assign(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(leadAssignSchema)) body: { ownerId: string | null }) {
    return this.leads.assign(actor, id, body.ownerId);
  }

  @Post(":id/accountant")
  @HttpCode(200)
  @CheckAbility("assign", "Lead")
  assignAccountant(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(leadAccountantSchema)) body: { accountantId: string | null }) {
    return this.leads.assignAccountant(actor, id, body.accountantId);
  }

  @Post(":id/convert-customer")
  @HttpCode(200)
  @CheckAbility("update", "Lead")
  convert(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(leadConvertSchema)) body: { customerId?: string }) {
    return this.leads.convertToCustomer(actor, id, body.customerId);
  }
}
