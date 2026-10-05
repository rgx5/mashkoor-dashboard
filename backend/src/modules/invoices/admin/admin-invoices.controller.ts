import { Body, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { invoiceInputSchema, invoiceListQuerySchema, invoiceUpdateSchema, type InvoiceData, type InvoiceListQuery, type InvoiceUpdateData } from "@mashkoor/shared";
import { z } from "zod";
import type { Response } from "express";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { RequireFeatures } from "../../../core/features/require-features";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { InvoicePdfService } from "../domain/invoice-pdf.service";
import { InvoicesService } from "../domain/invoices.service";

const prefillQuery = z.object({ bookingId: z.uuid().optional(), quotationId: z.uuid().optional() });
const pdfQuery = z.object({ breakup: z.enum(["true", "false"]).default("true").transform((v) => v === "true") });

/** `/api/v1/admin/invoices` — raised by the accountant from an accepted quotation's booking; payments are recorded against them. */
@PortalController("admin", "invoices")
@RequireFeatures("payments")
export class AdminInvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly pdf: InvoicePdfService,
  ) {}

  @Get()
  @CheckAbility("read", "Invoice")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(invoiceListQuerySchema)) query: InvoiceListQuery) {
    return this.invoices.list(actor, query);
  }

  /** What the invoice editor starts from for a booking or a quotation. */
  @Get("prefill")
  @CheckAbility("create", "Invoice")
  prefill(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(prefillQuery)) query: { bookingId?: string; quotationId?: string }) {
    return this.invoices.prefill(actor, query);
  }

  @Get(":id/pdf")
  @CheckAbility("read", "Invoice")
  async download(
    @CurrentUser() actor: RequestUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query(new ZodPipe(pdfQuery)) query: { breakup: boolean },
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.pdf.render(actor, id, query.breakup);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.fileName}"` });
    return new StreamableFile(file.data);
  }

  @Get(":id")
  @CheckAbility("read", "Invoice")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Invoice")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(invoiceInputSchema)) body: InvoiceData) {
    return this.invoices.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Invoice")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(invoiceUpdateSchema)) body: InvoiceUpdateData) {
    return this.invoices.update(actor, id, body);
  }

  @Post(":id/send")
  @HttpCode(200)
  @CheckAbility("update", "Invoice")
  send(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.send(actor, id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @CheckAbility("update", "Invoice")
  cancel(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.cancel(actor, id);
  }
}
