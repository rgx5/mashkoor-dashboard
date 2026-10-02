import { Injectable } from "@nestjs/common";
import { INVOICE_PAYMENT_STATE_LABELS, PAYMENT_METHOD_LABELS } from "@mashkoor/shared";
import PDFDocument from "pdfkit";
import type { RequestUser } from "../../../core/auth/request-user";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { CompanyService } from "../../company/company.service";
import { findFonts, findLogo, GOLD, INK, M, MUTED, PLUM, PLUM_DARK, TINT, TINT_LINE } from "../../itineraries/domain/quotation-pdf.service";
import { InvoicesService } from "./invoices.service";

const dateOnly = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The invoice as a one-page PDF in the same plum-and-gold design as the quotation: lines, totals, payment entries and bank details. */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly company: CompanyService,
  ) {}

  async render(actor: RequestUser, id: string): Promise<{ fileName: string; data: Buffer }> {
    const inv = await this.invoices.get(actor, id);
    const [profile, customer] = await Promise.all([this.company.get(), this.prisma.customer.findUnique({ where: { id: inv.customer.id }, select: { phone: true, email: true } })]);

    const fonts = findFonts();
    const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: `Invoice ${inv.refNo}`, Author: profile.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const W = doc.page.width - M * 2;
    const BOTTOM = doc.page.height - 56;
    const font = (bold = false) => doc.font(fonts ? (bold ? fonts.bold : fonts.regular) : bold ? "Helvetica-Bold" : "Helvetica");
    const sym = fonts ? "₹" : "Rs.";
    const money = (n: number) => `${sym} ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmt = (v: string | null | undefined) => (v ? dateOnly.format(new Date(v)) : "—");
    const ensure = (h: number) => {
      if (doc.y + h > BOTTOM) doc.addPage();
    };

    // Letterhead
    const logo = findLogo(profile.logoDataUrl);
    if (logo) {
      try {
        doc.image(logo, M, 20, { fit: [128, 72] });
      } catch {
        /* an unreadable logo just leaves the header without one */
      }
    } else {
      font(true).fontSize(17).fillColor(PLUM).text(profile.legalName ?? profile.name, M, 44, { width: W * 0.55, lineBreak: false });
    }
    font(true).fontSize(9).fillColor(PLUM).text("INVOICE", M + W * 0.55, 30, { width: W * 0.45, align: "right", characterSpacing: 3, lineBreak: false });
    font(true).fontSize(26).fillColor(PLUM_DARK).text(inv.refNo, M + W * 0.55, 45, { width: W * 0.45, align: "right", lineBreak: false });
    font().fontSize(8.5).fillColor(MUTED).text(`Issued ${fmt(inv.issueDate)}${inv.dueDate ? `  ·  Due ${fmt(inv.dueDate)}` : ""}`, M + W * 0.55, 76, { width: W * 0.45, align: "right", lineBreak: false });
    doc.rect(0, 104, doc.page.width, 4).fill(PLUM);
    doc.rect(0, 108, doc.page.width, 2).fill(GOLD);
    doc.y = 126;

    // From / billed to
    const gap = 14;
    const colW = (W - gap) / 2;
    const top = doc.y;
    const card = (x: number, title: string, lines: string[]) => {
      doc.roundedRect(x, top, colW, 96, 8).fillAndStroke(TINT, TINT_LINE);
      doc.rect(x, top + 14, 3, 14).fill(GOLD);
      font(true).fontSize(7).fillColor(MUTED).text(title.toUpperCase(), x + 16, top + 16, { width: colW - 28, characterSpacing: 0.6 });
      font(true).fontSize(11).fillColor(INK).text(lines[0] ?? "", x + 16, top + 30, { width: colW - 28 });
      font().fontSize(8.5).fillColor(MUTED);
      for (const line of lines.slice(1)) doc.text(line, x + 16, doc.y + 2, { width: colW - 28 });
    };
    card(M, "From", [profile.legalName ?? profile.name, profile.address ?? "", profile.phones.join("  ·  "), profile.gstin ? `GST ${profile.gstin}` : ""].filter(Boolean));
    card(M + colW + gap, "Billed to", [inv.customer.fullName, `${inv.customer.refNo}`, customer?.phone ?? "", customer?.email ?? "", `Booking ${inv.booking.refNo}`].filter(Boolean));
    doc.y = top + 96 + 18;

    // Lines
    const colX = { desc: M + 8, qty: M + W * 0.6, rate: M + W * 0.7, amount: M + W * 0.85 };
    const head = doc.y;
    doc.rect(M, head, W, 22).fill(PLUM);
    font(true).fontSize(8).fillColor("#ffffff");
    doc.text("DESCRIPTION", colX.desc, head + 7, { width: W * 0.5, lineBreak: false });
    doc.text("QTY", colX.qty, head + 7, { width: W * 0.08, align: "right", lineBreak: false });
    doc.text("RATE", colX.rate, head + 7, { width: W * 0.13, align: "right", lineBreak: false });
    doc.text("AMOUNT", colX.amount - 4, head + 7, { width: W * 0.15 - 4, align: "right", lineBreak: false });
    doc.y = head + 22;
    inv.lines.forEach((line, index) => {
      font().fontSize(9);
      const h = Math.max(doc.heightOfString(line.description, { width: W * 0.5 }), 11) + 12;
      ensure(h);
      const y = doc.y;
      if (index % 2 === 0) doc.rect(M, y, W, h).fill(TINT);
      font().fontSize(9).fillColor(INK);
      doc.text(line.description, colX.desc, y + 6, { width: W * 0.5 });
      doc.text(String(line.quantity), colX.qty, y + 6, { width: W * 0.08, align: "right", lineBreak: false });
      doc.text(money(line.unitPrice), colX.rate - 14, y + 6, { width: W * 0.13 + 14, align: "right", lineBreak: false });
      doc.text(money(line.quantity * line.unitPrice), colX.amount - 12, y + 6, { width: W * 0.15 + 8, align: "right", lineBreak: false });
      doc.y = y + h;
    });

    // Totals
    ensure(120);
    doc.y += 10;
    const totals: [string, string, boolean][] = [];
    if (inv.adjustment !== 0) totals.push([inv.adjustment < 0 ? "Discount" : "Adjustment", money(inv.adjustment), false]);
    totals.push(["Total", money(inv.total), true], ["Paid", money(inv.paid), false], ["Balance due", money(inv.balance), true]);
    for (const [label, value, strong] of totals) {
      const y = doc.y;
      font(strong).fontSize(strong ? 11 : 9.5).fillColor(strong ? PLUM_DARK : INK);
      doc.text(label, M + W * 0.55, y, { width: W * 0.2, lineBreak: false });
      doc.text(value, M + W * 0.7, y, { width: W * 0.3, align: "right", lineBreak: false });
      doc.y = y + (strong ? 18 : 15);
    }
    font(true).fontSize(9).fillColor(inv.state === "PAID" ? "#047857" : inv.state === "CANCELLED" ? "#b91c1c" : PLUM).text(INVOICE_PAYMENT_STATE_LABELS[inv.state].toUpperCase(), M, doc.y - 18, { width: W * 0.4, characterSpacing: 2, lineBreak: false });
    doc.y += 12;

    // Payment entries
    const entries = inv.payments.filter((p) => p.status !== "REJECTED");
    if (entries.length > 0) {
      ensure(50 + entries.length * 16);
      font(true).fontSize(11).fillColor(PLUM).text("Payments received", M, doc.y);
      doc.y += 6;
      for (const p of entries) {
        const y = doc.y;
        font().fontSize(9).fillColor(INK);
        doc.text(`${fmt(p.createdAt)}  ·  ${p.receiptNo}  ·  ${PAYMENT_METHOD_LABELS[p.method]}${p.reference ? `  ·  ${p.reference}` : ""}${p.status === "PENDING" ? "  ·  awaiting verification" : ""}`, M, y, { width: W * 0.75, lineBreak: false });
        doc.text(`${p.direction === "REFUND" ? "−" : ""}${money(p.amount)}`, M + W * 0.7, y, { width: W * 0.3, align: "right", lineBreak: false });
        doc.y = y + 16;
      }
    }

    // Notes and bank details
    if (inv.notes) {
      ensure(50);
      doc.y += 8;
      font(true).fontSize(9).fillColor(MUTED).text("NOTES", M, doc.y, { characterSpacing: 0.6 });
      font().fontSize(9).fillColor(INK).text(inv.notes, M, doc.y + 2, { width: W });
    }
    const bank = profile.bank;
    if (bank.accountNo) {
      ensure(80);
      doc.y += 12;
      font(true).fontSize(9).fillColor(MUTED).text("PAY BY BANK TRANSFER", M, doc.y, { characterSpacing: 0.6 });
      font().fontSize(9).fillColor(INK).text([bank.beneficiary, bank.bankName, `A/c ${bank.accountNo}`, bank.ifsc && `IFSC ${bank.ifsc}`, bank.branch].filter(Boolean).join("  ·  "), M, doc.y + 2, { width: W });
      if (profile.upiId) font().fontSize(9).fillColor(INK).text(`UPI: ${profile.upiId}`, M, doc.y + 2, { width: W });
    }

    doc.end();
    return { fileName: `${inv.refNo}.pdf`, data: await done };
  }
}
