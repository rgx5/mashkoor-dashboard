import { Injectable } from "@nestjs/common";
import { INVOICE_PAYMENT_STATE_LABELS, PAYMENT_METHOD_LABELS, PRODUCT_TYPE_LABELS } from "@mashkoor/shared";
import type { RequestUser } from "../../../core/auth/request-user";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { CompanyService } from "../../company/company.service";
import { formatPdfDate, renderLineDocument, type LineDocument } from "../../itineraries/domain/line-document-pdf";
import { InvoicesService } from "./invoices.service";

/**
 * The invoice as a PDF, in the same minimal layout as the quotation: the customer, the priced items (with or without a
 * breakup), totals with what has been paid and what is still due, the payments received, bank and UPI details and the terms.
 */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly company: CompanyService,
  ) {}

  async render(actor: RequestUser, id: string, breakup = true): Promise<{ fileName: string; data: Buffer }> {
    const inv = await this.invoices.get(actor, id);
    const [profile, customer] = await Promise.all([this.company.get(), this.prisma.customer.findUnique({ where: { id: inv.customer.id }, select: { phone: true, email: true } })]);

    const document: LineDocument = {
      kind: "INVOICE",
      refNo: inv.refNo,
      headerNote: `Issued ${formatPdfDate(inv.issueDate)}${inv.dueDate ? `   ·   Due ${formatPdfDate(inv.dueDate)}` : ""}`,
      customerLabel: "Billed to",
      customer: { name: inv.customer.fullName, phone: customer?.phone, email: customer?.email },
      facts: [
        ["Booking", inv.booking.refNo],
        ["Product", PRODUCT_TYPE_LABELS[inv.productType]],
        ["Status", INVOICE_PAYMENT_STATE_LABELS[inv.state]],
      ],
      subject: inv.subject,
      lines: inv.lines,
      adjustment: inv.adjustment,
      total: inv.total,
      packageLabel: "Total",
      afterTotal: [
        { label: "Paid", value: inv.paid },
        { label: "Balance due", value: inv.balance, big: true },
      ],
      payments: inv.payments
        .filter((p) => p.status !== "REJECTED")
        .map((p) => ({
          date: formatPdfDate(p.createdAt),
          details: `${p.receiptNo}  ·  ${PAYMENT_METHOD_LABELS[p.method]}${p.reference ? `  ·  ${p.reference}` : ""}${p.status === "PENDING" ? "  ·  awaiting verification" : ""}`,
          amount: p.amount,
          refund: p.direction === "REFUND",
        })),
      notes: inv.notes,
      terms: inv.terms,
      footer: `${profile.name}  ·  ${inv.refNo}  ·  Computer-generated, no signature needed`,
    };
    const data = await renderLineDocument(profile, document, breakup, `Invoice ${inv.refNo}`);
    return { fileName: `${inv.refNo}${breakup ? "" : "-total-only"}.pdf`, data };
  }
}
