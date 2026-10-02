import { Body, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  financeBookingsQuerySchema,
  financeEntryInputSchema,
  financeRangeSchema,
  financeReverseSchema,
  ledgerQuerySchema,
  MAX_RECEIPT_BYTES,
  type FinanceBookingsQuery,
  type FinanceEntryData,
  type FinanceRange,
  type FinanceReverseData,
  type LedgerQuery,
} from "@mashkoor/shared";
import type { Response } from "express";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { RequireFeatures } from "../../../core/features/require-features";
import { AppError } from "../../../core/http/app-error";
import { sendFile } from "../../../core/http/send-file";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { FinanceService } from "../domain/finance.service";

/** `/api/v1/admin/finance` — the accounts section: the ledger of every rupee in and out, an overview, and supplier payments and expenses. */
@PortalController("admin", "finance")
@RequireFeatures("payments")
export class AdminFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("overview")
  @CheckAbility("read", "FinanceEntry")
  overview(@Query(new ZodPipe(financeRangeSchema)) query: FinanceRange) {
    return this.finance.overview(query);
  }

  @Get("ledger")
  @CheckAbility("read", "FinanceEntry")
  ledger(@Query(new ZodPipe(ledgerQuerySchema)) query: LedgerQuery) {
    return this.finance.ledger(query);
  }

  @Get("bookings")
  @CheckAbility("read", "FinanceEntry")
  bookings(@Query(new ZodPipe(financeBookingsQuerySchema)) query: FinanceBookingsQuery) {
    return this.finance.bookings(query);
  }

  @Get("parties")
  @CheckAbility("read", "FinanceEntry")
  parties() {
    return this.finance.parties();
  }

  @Post("entries")
  @CheckAbility("create", "FinanceEntry")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(financeEntryInputSchema)) body: FinanceEntryData) {
    return this.finance.create(actor, body);
  }

  @Post("entries/:id/reverse")
  @HttpCode(200)
  @CheckAbility("update", "FinanceEntry")
  reverse(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(financeReverseSchema)) body: FinanceReverseData) {
    return this.finance.reverse(actor, id, body.reason);
  }

  @Post("entries/:id/receipt")
  @HttpCode(200)
  @CheckAbility("update", "FinanceEntry")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_RECEIPT_BYTES } }))
  attach(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw AppError.notFound("File");
    return this.finance.attachReceipt(actor, id, file.originalname, file.buffer);
  }

  @Get("entries/:id/receipt")
  @CheckAbility("read", "FinanceEntry")
  async receipt(@Param("id", ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return sendFile(res, await this.finance.downloadReceipt(id));
  }
}
