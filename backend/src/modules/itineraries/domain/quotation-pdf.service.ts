import { Injectable } from "@nestjs/common";
import { ITINERARY_LINE_KIND_LABELS, ITINERARY_STATUS_LABELS, LEAD_STAGE_LABELS, lineTotal } from "@mashkoor/shared";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { RequestUser } from "../../../core/auth/request-user";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { CompanyService } from "../../company/company.service";
import { ItinerariesService } from "./itineraries.service";

// Mashkoor brand: plum with a gold accent, on soft plum tints.
const PLUM = "#63134c";
const PLUM_DARK = "#3a0b2c";
const GOLD = "#f3c34a";
const TINT = "#faf2f7";
const TINT_LINE = "#dcc7d5";
const INK = "#231920";
const MUTED = "#6b5a66";
const M = 36;

/** Looks for an OFL font that has the rupee sign (assets/fonts/NotoSans-*.ttf); without one the PDF prints "Rs." in Helvetica. */
function findFonts() {
  for (const dir of [join(process.cwd(), "assets", "fonts"), join(__dirname, "..", "..", "..", "..", "assets", "fonts")]) {
    const regular = join(dir, "NotoSans-Regular.ttf");
    const bold = join(dir, "NotoSans-Bold.ttf");
    if (existsSync(regular) && existsSync(bold)) return { regular, bold };
  }
  return null;
}

/** The profile's uploaded logo wins; otherwise the Mashkoor logo bundled in assets/. */
function findLogo(dataUrl: string | null): Buffer | null {
  if (dataUrl) return Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
  for (const dir of [join(process.cwd(), "assets"), join(__dirname, "..", "..", "..", "..", "assets")]) {
    const file = join(dir, "logo.jpg");
    if (existsSync(file)) return readFileSync(file);
  }
  return null;
}

const dateOnly = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dateTime = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

/**
 * M10 · The quotation PDF for an itinerary. It carries every field a travel-agency quotation needs — quote details, subject and
 * relationship manager, the priced product table with discount and tax, totals, payment due dates, flight and hotel tables,
 * scan-to-pay, bank details, documents required and numbered terms — in Mashkoor's own plum and gold design.
 */
@Injectable()
export class QuotationPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itineraries: ItinerariesService,
    private readonly company: CompanyService,
  ) {}

  async render(actor: RequestUser, id: string): Promise<{ fileName: string; data: Buffer }> {
    const it = await this.itineraries.get(actor, id);
    const [profile, customer, owner, lead] = await Promise.all([
      this.company.get(),
      it.customer ? this.prisma.customer.findUnique({ where: { id: it.customer.id }, select: { fullName: true, phone: true } }) : null,
      it.owner ? this.prisma.user.findUnique({ where: { id: it.owner.id }, select: { name: true } }) : null,
      it.lead ? this.prisma.lead.findUnique({ where: { id: it.lead.id }, select: { stage: true } }) : null,
    ]);

    const fonts = findFonts();
    const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: `Quotation ${it.refNo}`, Author: profile.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const W = doc.page.width - M * 2;
    const BOTTOM = doc.page.height - 56;
    const font = (bold = false, italic = false) => doc.font(fonts ? (bold ? fonts.bold : fonts.regular) : bold ? "Helvetica-Bold" : italic ? "Helvetica-Oblique" : "Helvetica");
    const sym = fonts ? "₹" : "Rs.";
    const money = (n: number) => `${sym} ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (v: string | null | undefined) => (v ? dateOnly.format(new Date(v)) : "");

    // Continuation pages get a slim brand strip; the first page has the full letterhead band.
    const strip = () => {
      doc.rect(0, 0, doc.page.width, 26).fill(PLUM_DARK);
      doc.rect(0, 26, doc.page.width, 2).fill(GOLD);
      font(true).fontSize(9).fillColor("#ffffff").text(`Quotation  ·  ${it.refNo}`, M, 9, { width: W, lineBreak: false });
      doc.y = 44;
    };
    doc.on("pageAdded", strip);
    const ensure = (h: number) => {
      if (doc.y + h > BOTTOM) doc.addPage();
    };
    const label = (t: string, x: number, y: number, w: number) => font(true).fontSize(7).fillColor(MUTED).text(t.toUpperCase(), x, y, { width: w, characterSpacing: 0.6 });
    const heading = (t: string) => {
      ensure(50);
      doc.y += 12;
      const y = doc.y;
      doc.rect(M, y + 1, 3, 12).fill(GOLD);
      font(true).fontSize(11).fillColor(PLUM).text(t, M + 10, y, { width: W - 10 });
      doc.y = y + 20;
    };
    const cell = (x: number, y: number, w: number, h: number, fill?: string) => {
      if (fill) doc.rect(x, y, w, h).fillAndStroke(fill, TINT_LINE);
      else doc.rect(x, y, w, h).strokeColor(TINT_LINE).lineWidth(0.7).stroke();
    };

    // ── Letterhead ────────────────────────────────────────────────────────
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
    font(true).fontSize(9).fillColor(PLUM).text("QUOTATION", M + W * 0.55, 30, { width: W * 0.45, align: "right", characterSpacing: 3, lineBreak: false });
    font(true).fontSize(26).fillColor(PLUM_DARK).text(it.refNo, M + W * 0.55, 45, { width: W * 0.45, align: "right", lineBreak: false });
    font().fontSize(8.5).fillColor(MUTED).text(`Issued ${dateOnly.format(new Date(it.createdAt))}`, M + W * 0.55, 76, { width: W * 0.45, align: "right", lineBreak: false });
    doc.rect(0, 104, doc.page.width, 4).fill(PLUM);
    doc.rect(0, 108, doc.page.width, 2).fill(GOLD);
    doc.y = 124;

    // ── From / prepared for ───────────────────────────────────────────────
    const stage = lead ? LEAD_STAGE_LABELS[lead.stage] : ITINERARY_STATUS_LABELS[it.status];
    const customerName = customer?.fullName ?? it.customer?.fullName ?? "—";
    const colGap = 14;
    const colW = (W - colGap) / 2;
    const inner = colW - 28;
    const fromLines: [string, string][] = ([["Phone", profile.phones.join("  ·  ")], ["Email", profile.email ?? ""], ["GST", profile.gstin ?? ""], ["PAN No.", profile.pan ?? ""]] as [string, string][]).filter(([, v]) => v);
    font().fontSize(8.5);
    const addrH = profile.address ? doc.heightOfString(profile.address, { width: inner }) : 0;
    const cardH = Math.max(36 + addrH + fromLines.length * 13 + 12, 98);
    const cy = doc.y;
    doc.roundedRect(M, cy, colW, cardH, 8).fillAndStroke(TINT, TINT_LINE);
    doc.roundedRect(M + colW + colGap, cy, colW, cardH, 8).fillAndStroke(TINT, TINT_LINE);
    doc.rect(M, cy + 14, 3, 14).fill(GOLD);
    label("From", M + 16, cy + 16, inner);
    font(true).fontSize(11).fillColor(INK).text(profile.legalName ?? profile.name, M + 16, cy + 30, { width: inner });
    if (profile.address) font().fontSize(8.5).fillColor(MUTED).text(profile.address, M + 16, doc.y + 2, { width: inner });
    let fy = doc.y + 6;
    for (const [k, v] of fromLines) {
      font(true).fontSize(8).fillColor(INK).text(`${k}: `, M + 16, fy, { continued: true, width: inner });
      font().text(v);
      fy += 13;
    }
    const rx = M + colW + colGap + 16;
    doc.rect(M + colW + colGap, cy + 14, 3, 14).fill(GOLD);
    label("Prepared for", rx, cy + 16, inner);
    font(true).fontSize(14).fillColor(INK).text(customerName, rx, cy + 30, { width: inner, lineBreak: false, ellipsis: true });
    font().fontSize(9).fillColor(MUTED).text("Customer contact no.", rx, cy + 54, { width: inner, lineBreak: false });
    font(true).fontSize(11).fillColor(INK).text(customer?.phone ?? "—", rx, cy + 66, { width: inner, lineBreak: false });
    doc.y = cy + cardH + 12;

    // ── Quote facts strip ─────────────────────────────────────────────────
    const facts: [string, string, number][] = [
      ["Tour name", it.title, 2.2],
      ["Quote date", dateTime.format(new Date(it.createdAt)).replace(",", ""), 1.4],
      ["Quote stage", stage, 1],
      ["Quote valid till", it.validUntil ? fmtDate(it.validUntil) : "—", 1.1],
    ];
    const weight = facts.reduce((n, f) => n + f[2], 0);
    font(true).fontSize(9.5);
    const fh = Math.max(...facts.map(([, v, w]) => doc.heightOfString(v, { width: (W * w) / weight - 24 }))) + 32;
    const fyTop = doc.y;
    doc.roundedRect(M, fyTop, W, fh, 8).lineWidth(0.8).strokeColor(TINT_LINE).stroke();
    let fx = M;
    facts.forEach(([k, v, w], i) => {
      const cw2 = (W * w) / weight;
      if (i > 0) doc.moveTo(fx, fyTop + 10).lineTo(fx, fyTop + fh - 10).strokeColor(TINT_LINE).lineWidth(0.8).stroke();
      label(k, fx + 12, fyTop + 11, cw2 - 20);
      font(true).fontSize(9.5).fillColor(i === 2 ? PLUM : INK).text(v, fx + 12, fyTop + 24, { width: cw2 - 24 });
      fx += cw2;
    });
    doc.y = fyTop + fh + 10;

    // ── Subject and relationship manager ──────────────────────────────────
    const ry = doc.y;
    const subjW = W * 0.6;
    doc.roundedRect(M, ry, subjW - 6, 34, 6).fill(PLUM);
    doc.roundedRect(M + subjW + 6, ry, W - subjW - 6, 34, 6).fill(PLUM_DARK);
    font(true).fontSize(7).fillColor(GOLD).text("SUBJECT", M + 14, ry + 7, { width: subjW - 30, characterSpacing: 1, lineBreak: false });
    font(true).fontSize(10.5).fillColor("#ffffff").text(it.subject ?? customerName, M + 14, ry + 18, { width: subjW - 30, lineBreak: false, ellipsis: true });
    font(true).fontSize(7).fillColor(GOLD).text("RELATIONSHIP MANAGER", M + subjW + 20, ry + 7, { width: W - subjW - 34, characterSpacing: 1, lineBreak: false });
    font(true).fontSize(10.5).fillColor("#ffffff").text(owner?.name ? `Mr. ${owner.name.replace(/^Mr\.?\s*/i, "")}` : "—", M + subjW + 20, ry + 18, { width: W - subjW - 34, lineBreak: false, ellipsis: true });
    doc.y = ry + 50;

    // ── Product table ─────────────────────────────────────────────────────
    const wNo = 28;
    const wQty = 30;
    const wPrice = 66;
    const wAmt = 66;
    const wLess = 52;
    const wTax = 52;
    const wTotal = 70;
    const wName = W - wNo - wQty - wPrice - wAmt - wLess - wTax - wTotal;
    const xs = [M, M + wNo, M + wNo + wName, M + wNo + wName + wQty, M + wNo + wName + wQty + wPrice, M + wNo + wName + wQty + wPrice + wAmt, M + wNo + wName + wQty + wPrice + wAmt + wLess, M + wNo + wName + wQty + wPrice + wAmt + wLess + wTax];
    const ws = [wNo, wName, wQty, wPrice, wAmt, wLess, wTax, wTotal];
    const heads = ["S.NO", "Product Name", "Qty", "Price", "Amt", "Less", "Tax", "Total Amt"];
    const tableHead = () => {
      const y0 = doc.y;
      doc.rect(M, y0, W, 24).fill(PLUM);
      font(true).fontSize(7.5).fillColor("#ffffff");
      heads.forEach((h, i) => doc.text(h.toUpperCase(), xs[i]! + 3, y0 + 8, { width: ws[i]! - 6, align: i === 1 ? "left" : "center", lineBreak: false }));
      doc.y = y0 + 24;
    };
    tableHead();
    it.lines.forEach((line, i) => {
      const kind = line.kind && line.kind !== "OTHER" ? ITINERARY_LINE_KIND_LABELS[line.kind] : "";
      const detail = line.detail ?? "";
      font(true).fontSize(9);
      const th = doc.heightOfString(line.description, { width: wName - 12 });
      font().fontSize(8);
      const dh = detail ? doc.heightOfString(detail, { width: wName - 12 }) + 4 : 0;
      const h = Math.max(th + dh + (kind ? 11 : 0) + 14, 34);
      if (doc.y + h > BOTTOM) {
        doc.addPage();
        tableHead();
      }
      const y0 = doc.y;
      ws.forEach((w, k) => cell(xs[k]!, y0, w, h, i % 2 === 0 ? TINT : undefined));
      let ty = y0 + 6;
      if (kind) {
        font(true).fontSize(6.5).fillColor(PLUM).text(kind.toUpperCase(), xs[1]! + 6, ty, { width: wName - 12, characterSpacing: 0.5 });
        ty += 10;
      }
      font(true).fontSize(9).fillColor(INK).text(line.description, xs[1]! + 6, ty, { width: wName - 12 });
      if (detail) font(false, true).fontSize(8).fillColor(MUTED).text(detail, xs[1]! + 6, ty + th + 4, { width: wName - 12 });
      const amount = line.quantity * line.unitPrice;
      const tax = Math.round(((Math.max(0, amount - (line.discount ?? 0))) * (line.taxPercent ?? 0)) / 100);
      font().fontSize(8.5).fillColor(INK);
      doc.text(String(i + 1), xs[0]! + 3, y0 + 6, { width: wNo - 6, align: "center" });
      doc.text(String(line.quantity), xs[2]! + 3, y0 + 6, { width: wQty - 6, align: "center" });
      doc.fontSize(7.5);
      doc.text(money(line.unitPrice), xs[3]! + 3, y0 + 6, { width: wPrice - 6, align: "center" });
      doc.text(money(amount), xs[4]! + 3, y0 + 6, { width: wAmt - 6, align: "center" });
      doc.text(money(line.discount ?? 0), xs[5]! + 3, y0 + 6, { width: wLess - 6, align: "center" });
      doc.text(money(tax), xs[6]! + 3, y0 + 6, { width: wTax - 6, align: "center" });
      if ((line.taxPercent ?? 0) > 0) font().fontSize(6.5).fillColor(MUTED).text(`${line.taxPercent}%`, xs[6]! + 3, y0 + 20, { width: wTax - 6, align: "center" });
      font(true).fontSize(7.5).fillColor(INK).text(money(lineTotal(line)), xs[7]! + 3, y0 + 6, { width: wTotal - 6, align: "center" });
      doc.y = y0 + h;
    });
    if (it.lines.length === 0) {
      cell(M, doc.y, W, 26);
      font().fontSize(8.5).fillColor(MUTED).text("No items priced yet.", M + 10, doc.y + 9, { width: W - 20 });
      doc.y += 26;
    }

    // ── Totals ────────────────────────────────────────────────────────────
    ensure(84);
    doc.y += 12;
    const subTotal = it.lines.reduce((n, l) => n + lineTotal(l), 0);
    const tx = M + W - 240;
    let ty2 = doc.y;
    for (const [k, v] of [["Sub Total", money(subTotal)], ["Adjustments", money(it.adjustment)]] as const) {
      font(true).fontSize(9).fillColor(MUTED).text(`${k} :`, tx, ty2, { width: 110, align: "right", lineBreak: false });
      font(true).fontSize(9).fillColor(INK).text(v, tx + 116, ty2, { width: 124, align: "right", lineBreak: false });
      ty2 += 16;
    }
    doc.roundedRect(tx, ty2 + 2, 240, 30, 6).fill(PLUM);
    font(true).fontSize(9).fillColor(GOLD).text("GRAND TOTAL", tx + 12, ty2 + 12, { width: 100, characterSpacing: 1, lineBreak: false });
    font(true).fontSize(13).fillColor("#ffffff").text(money(it.totalPrice), tx + 100, ty2 + 9, { width: 132, align: "right", lineBreak: false });
    doc.y = ty2 + 44;

    // ── Payment due dates, description, notes ─────────────────────────────
    ensure(9 * 20);
    const line = (lab: string, mid: string, right: string, tinted = false) => {
      const y0 = doc.y;
      cell(M, y0, W, 20, tinted ? TINT : undefined);
      font(true).fontSize(8.5).fillColor(INK).text(lab, M + 10, y0 + 6, { width: 170, lineBreak: false });
      font().fontSize(8.5).fillColor(INK).text(mid, M + 190, y0 + 6, { width: 170, lineBreak: false });
      font(true).fontSize(8.5).fillColor(INK).text(right, M + W - 140, y0 + 6, { width: 130, align: "right", lineBreak: false });
      doc.y = y0 + 20;
    };
    line("Full Payment Due Date :", it.fullPaymentDueDate ? fmtDate(it.fullPaymentDueDate) : "", money(it.totalPrice), true);
    ORDINALS.forEach((o, i) => {
      const p = it.paymentSchedule[i];
      line(`${o} Payment Due Date :`, p?.dueDate ? fmtDate(p.dueDate) : "", p ? money(p.amount) : "");
    });
    for (const [lab, text] of [["Description :", it.quoteDescription], ["Notes :", it.quoteNotes]] as const) {
      font().fontSize(8.5);
      const h = Math.max(20, doc.heightOfString(text ?? "", { width: W - 130 }) + 12);
      ensure(h);
      const y0 = doc.y;
      cell(M, y0, W, h);
      font(true).fontSize(8.5).fillColor(INK).text(lab, M + 10, y0 + 6, { width: 100, lineBreak: false });
      font().fontSize(8.5).fillColor(INK).text(text ?? "", M + 120, y0 + 6, { width: W - 130 });
      doc.y = y0 + h;
    }
    doc.y += 8;

    // ── Flight and hotel tables (always shown, so they can be filled in by hand too) ──
    const grid = (headers: string[], widths: number[], data: string[][], minRows: number) => {
      const rowsToDraw = data.length ? data : Array.from({ length: minRows }, () => headers.map(() => ""));
      const draw = () => {
        const y0 = doc.y;
        font(true).fontSize(6.8);
        const hh = Math.max(...headers.map((h, i) => doc.heightOfString(h.toUpperCase(), { width: widths[i]! - 8 }))) + 12;
        doc.rect(M, y0, W, hh).fill(PLUM);
        let x = M;
        headers.forEach((h, i) => {
          doc.fillColor("#ffffff").text(h.toUpperCase(), x + 4, y0 + 6, { width: widths[i]! - 8, align: "center" });
          x += widths[i]!;
        });
        doc.y = y0 + hh;
      };
      ensure(70);
      draw();
      rowsToDraw.forEach((r, ri) => {
        font().fontSize(8);
        const h = Math.max(...r.map((c, i) => doc.heightOfString(c || " ", { width: widths[i]! - 8 })), 12) + 10;
        if (doc.y + h > BOTTOM) {
          doc.addPage();
          draw();
        }
        const y0 = doc.y;
        let x = M;
        r.forEach((c, i) => {
          cell(x, y0, widths[i]!, h, ri % 2 === 0 ? TINT : undefined);
          font().fontSize(8).fillColor(INK).text(c, x + 4, y0 + 5, { width: widths[i]! - 8, align: "center" });
          x += widths[i]!;
        });
        doc.y = y0 + h;
      });
      doc.y += 10;
    };
    const wf = [46, 54, 62, 54, 62, 48, 56, 56];
    grid(["Trip Type", "Departure City", "Departure Date/Time", "Arrival City", "Arrival Date/Time", "Airlines", "Hand-Carry Weight Allowance", "Check-In Baggage Allowance", "ZamZam Check-in Allowance"], [...wf, W - wf.reduce((a, b) => a + b, 0)], it.flights.map((f) => [f.tripType, f.departureCity, f.departureAt, f.arrivalCity, f.arrivalAt, f.airline, f.handCarry, f.checkInBaggage, f.zamzam]), 2);
    grid(["City", "Hotel", "Distance from Haram", "Check-in Date", "Check-out Date"], [W * 0.16, W * 0.3, W * 0.18, W * 0.18, W * 0.18], it.hotels.map((h) => [h.city, h.hotel, h.distanceFromHaram, h.checkIn, h.checkOut]), 2);

    // ── Inclusions / exclusions (when the quote lists them) ───────────────
    for (const [title, items] of [["Inclusions", it.inclusions], ["Exclusions", it.exclusions]] as const) {
      if (!items.length) continue;
      heading(title);
      font().fontSize(9).fillColor(INK);
      for (const item of items) {
        ensure(14);
        doc.text(`•  ${item}`, M + 6, doc.y, { width: W - 12 });
        doc.y += 1;
      }
    }

    // ── Scan to pay ───────────────────────────────────────────────────────
    ensure(96);
    const sy = doc.y;
    doc.roundedRect(M, sy, W, 84, 6).fillAndStroke(TINT, TINT_LINE);
    if (profile.upiId) {
      const png = await QRCode.toBuffer(`upi://pay?pa=${encodeURIComponent(profile.upiId)}&pn=${encodeURIComponent(profile.name)}&cu=INR`, { margin: 1, width: 240 });
      doc.image(png, M + 12, sy + 8, { width: 68 });
    }
    font(true).fontSize(8).fillColor(PLUM).text("SCAN TO PAY", M + 96, sy + 22, { width: W * 0.45, characterSpacing: 1, lineBreak: false });
    font(true).fontSize(9.5).fillColor(INK).text(profile.upiId ?? "UPI details not added yet", M + 96, sy + 36, { width: W * 0.45, lineBreak: false });
    font().fontSize(8.5).fillColor(INK).text(profile.legalName ?? profile.name, M + 96, sy + 51, { width: W * 0.45, lineBreak: false });
    font().fontSize(8).fillColor(MUTED).text("Pay with any UPI app on your phone", M + W * 0.55, sy + 36, { width: W * 0.45 - 12, align: "right", lineBreak: false });
    doc.y = sy + 96;

    // ── Bank details / documents required ────────────────────────────────
    const bank: [string, string | null][] = [["Beneficiary Name", profile.bank.beneficiary], ["Bank Name", profile.bank.bankName], ["A/c No.", profile.bank.accountNo], ["Ifsc Code", profile.bank.ifsc], ["Branch", profile.bank.branch]];
    const n = Math.max(bank.length, profile.documentsRequired.length);
    ensure((n + 1) * 20 + 10);
    const by = doc.y;
    const hw = W / 2;
    doc.rect(M, by, hw, 20).fill(PLUM);
    doc.rect(M + hw, by, hw, 20).fill(PLUM);
    font(true).fontSize(8).fillColor("#ffffff");
    doc.text("BANK DETAILS", M, by + 7, { width: hw, align: "center", lineBreak: false }).text("DOCUMENTS REQUIRED", M + hw, by + 7, { width: hw, align: "center", lineBreak: false });
    for (let i = 0; i < n; i++) {
      const ry = by + 20 + i * 20;
      cell(M, ry, hw * 0.4, 20, TINT);
      cell(M + hw * 0.4, ry, hw * 0.6, 20);
      cell(M + hw, ry, hw, 20);
      if (bank[i]) {
        font(true).fontSize(8.5).fillColor(INK).text(bank[i]![0], M + 8, ry + 6, { width: hw * 0.4 - 12, lineBreak: false });
        font().fontSize(8.5).text(bank[i]![1] ?? "", M + hw * 0.4 + 8, ry + 6, { width: hw * 0.6 - 12, lineBreak: false, ellipsis: true });
      }
      if (profile.documentsRequired[i]) font().fontSize(8.5).fillColor(INK).text(profile.documentsRequired[i]!, M + hw + 8, ry + 6, { width: hw - 16, align: "center", lineBreak: false, ellipsis: true });
    }
    doc.y = by + 20 + n * 20 + 8;

    // ── Terms & conditions ────────────────────────────────────────────────
    if (it.terms) {
      ensure(60);
      doc.y += 6;
      font(true).fontSize(11).fillColor(PLUM).text("Terms & Conditions :-", M, doc.y, { width: W, align: "center" });
      doc.rect(M + W / 2 - 24, doc.y + 2, 48, 2).fill(GOLD);
      doc.y += 12;
      for (const t of it.terms.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const isTitle = /^\d+\.\s+\S/.test(t) && t.length < 70;
        ensure(isTitle ? 30 : 16);
        if (isTitle) {
          doc.y += 3;
          font(true).fontSize(8.5).fillColor(PLUM).text(t, M + 4, doc.y, { width: W - 8 });
        } else font().fontSize(8).fillColor(INK).text(t, M + 14, doc.y, { width: W - 20, align: "justify" });
      }
    }

    // ── Sign-off ──────────────────────────────────────────────────────────
    ensure(50);
    doc.y += 14;
    if (profile.address) font(true).fontSize(8.5).fillColor(INK).text(`Office Address :- ${profile.address.replace(/\n/g, ", ")}`, M, doc.y, { width: W, align: "center" });
    doc.y += 8;
    font().fontSize(8.5).fillColor(MUTED).text("This is computer generated quotation, no need for signature.", M, doc.y, { width: W, align: "center" });

    // ── Page footer ───────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // The footer sits inside the bottom margin; without this pdfkit would start a new page for it.
      doc.page.margins.bottom = 0;
      doc.rect(0, doc.page.height - 32, doc.page.width, 32).fill(PLUM_DARK);
      doc.rect(0, doc.page.height - 32, doc.page.width, 2).fill(GOLD);
      font().fontSize(7.5).fillColor("#e6c1d8").text(`${profile.name}  ·  ${it.refNo}`, M, doc.page.height - 20, { width: W - 60, lineBreak: false });
      font(true).text(`${i + 1} / ${range.count}`, M + W - 50, doc.page.height - 20, { width: 50, align: "right", lineBreak: false });
    }

    doc.end();
    return { fileName: `${it.refNo}.pdf`, data: await done };
  }
}
