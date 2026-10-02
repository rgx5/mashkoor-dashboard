import { Injectable } from "@nestjs/common";
import { lineTotal, PRODUCT_TYPE_LABELS, TRIP_TYPE_LABELS } from "@mashkoor/shared";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { RequestUser } from "../../../core/auth/request-user";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { CompanyService } from "../../company/company.service";
import { ItinerariesService } from "./itineraries.service";

// Mashkoor brand: plum with a gold accent, on soft plum tints.
export const PLUM = "#63134c";
export const PLUM_DARK = "#3a0b2c";
export const GOLD = "#f3c34a";
export const TINT = "#faf2f7";
export const TINT_LINE = "#dcc7d5";
export const INK = "#231920";
export const MUTED = "#6b5a66";
export const M = 36;

/** Looks for an OFL font that has the rupee sign (assets/fonts/NotoSans-*.ttf); without one the PDF prints "Rs." in Helvetica. */
export function findFonts() {
  for (const dir of [join(process.cwd(), "assets", "fonts"), join(__dirname, "..", "..", "..", "..", "assets", "fonts")]) {
    const regular = join(dir, "NotoSans-Regular.ttf");
    const bold = join(dir, "NotoSans-Bold.ttf");
    if (existsSync(regular) && existsSync(bold)) return { regular, bold };
  }
  return null;
}

/** The profile's uploaded logo wins; otherwise the Mashkoor logo bundled in assets/. */
export function findLogo(dataUrl: string | null): Buffer | null {
  if (dataUrl) return Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
  for (const dir of [join(process.cwd(), "assets"), join(__dirname, "..", "..", "..", "..", "assets")]) {
    const file = join(dir, "logo.jpg");
    if (existsSync(file)) return readFileSync(file);
  }
  return null;
}

const dateOnly = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dateTime = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/**
 * M10 · The quotation PDF for an itinerary: black and grey only, two type sizes, and a full border round every table. It carries everything on the itinerary — customer and trip summary, the priced items (with or without a breakup),
 * totals, payment schedule, flights, hotels, the day-by-day plan, inclusions, notes, bank and UPI details and the terms.
 */
@Injectable()
export class QuotationPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itineraries: ItinerariesService,
    private readonly company: CompanyService,
  ) {}

  /**
   * `breakup` true prints every item with its own price, discount, tax and total. False prints the same items with their
   * quantities but no prices, and one package price at the bottom.
   */
  async render(actor: RequestUser, id: string, breakup = true): Promise<{ fileName: string; data: Buffer }> {
    const it = await this.itineraries.get(actor, id);
    const [profile, customer] = await Promise.all([
      this.company.get(),
      it.customer ? this.prisma.customer.findUnique({ where: { id: it.customer.id }, select: { fullName: true, phone: true } }) : null,
    ]);
    // The relationship manager chosen on the quotation, or whoever owns it.
    const owner = it.relationshipManager ?? it.owner;

    const fonts = findFonts();
    const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true, info: { Title: `Quotation ${it.refNo}`, Author: profile.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    // Two type sizes and two colours, everywhere: SIZE for everything, BIG for the quotation number, the customer and the total.
    const SIZE = 10;
    const BIG = 14;
    const BLACK = "#1a1a1a";
    const GREY = "#666666";
    const PAD = 6;

    const W = doc.page.width - M * 2;
    const BOTTOM = doc.page.height - 60;
    const font = (bold = false) => doc.font(fonts ? (bold ? fonts.bold : fonts.regular) : bold ? "Helvetica-Bold" : "Helvetica");
    const sym = fonts ? "₹" : "Rs.";
    const money = (n: number) => `${sym} ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const moneyExact = (n: number) => `${sym} ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtDate = (v: string | null | undefined) => (v ? dateOnly.format(new Date(v)) : "");
    const ensure = (h: number) => {
      if (doc.y + h > BOTTOM) doc.addPage();
    };

    const write = (s: string, x: number, y: number, o: { w: number; bold?: boolean; size?: number; color?: string; align?: "left" | "right" | "center"; spacing?: number; oneLine?: boolean }) => {
      font(o.bold).fontSize(o.size ?? SIZE).fillColor(o.color ?? BLACK).text(s, x, y, { width: o.w, align: o.align ?? "left", characterSpacing: o.spacing, lineBreak: !o.oneLine });
    };
    const heightOf = (s: string, w: number, bold = false, size = SIZE) => {
      font(bold).fontSize(size);
      return doc.heightOfString(s || " ", { width: w });
    };
    const rect = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h).lineWidth(0.6).strokeColor(GREY).stroke();
    const vlines = (xs: number[], y: number, h: number) => {
      for (const x of xs) doc.moveTo(x, y).lineTo(x, y + h).lineWidth(0.6).strokeColor(GREY).stroke();
    };
    const section = (title: string) => {
      // Keep a heading together with its first rows instead of stranding it at the foot of a page.
      ensure(100);
      doc.y += 16;
      write(title.toUpperCase(), M, doc.y, { w: W, bold: true, spacing: 1, oneLine: true });
      doc.y += 20;
    };

    /** A table with a border round every cell: a bold header row, then one row per entry. Rows wrap and never split across pages. */
    const table = (columns: { label: string; width: number; align?: "left" | "right" }[], rows: string[][]) => {
      const xs: number[] = [];
      let acc = M;
      for (const c of columns) {
        xs.push(acc);
        acc += c.width;
      }
      const head = () => {
        const h = Math.max(...columns.map((c) => heightOf(c.label, c.width - PAD * 2, true))) + PAD * 2;
        const y0 = doc.y;
        rect(M, y0, W, h);
        vlines(xs.slice(1), y0, h);
        columns.forEach((c, i) => write(c.label, xs[i]! + PAD, y0 + PAD, { w: c.width - PAD * 2, bold: true, align: c.align }));
        doc.y = y0 + h;
      };
      const rowHeight = (r: string[]) => Math.max(...r.map((c, i) => heightOf(c, columns[i]!.width - PAD * 2))) + PAD * 2;
      const headHeight = Math.max(...columns.map((c) => heightOf(c.label, c.width - PAD * 2, true))) + PAD * 2;
      if (doc.y + headHeight + (rows[0] ? rowHeight(rows[0]) : 0) > BOTTOM) doc.addPage();
      head();
      for (const r of rows) {
        const h = rowHeight(r);
        if (doc.y + h > BOTTOM) {
          doc.addPage();
          head();
        }
        const y0 = doc.y;
        rect(M, y0, W, h);
        vlines(xs.slice(1), y0, h);
        r.forEach((c, i) => write(c, xs[i]! + PAD, y0 + PAD, { w: columns[i]!.width - PAD * 2, align: columns[i]!.align }));
        doc.y = y0 + h;
      }
    };

    /** A single-column list whose bold first row is its own title (inclusions, notes, documents). */
    const listTable = (title: string, items: string[]) => {
      ensure(80);
      doc.y += 16;
      table([{ label: title, width: W }], items.map((item) => [item]));
    };

    // ── Header: who we are, and what this document is ─────────────────────
    const logo = findLogo(profile.logoDataUrl);
    if (logo) {
      try {
        doc.image(logo, M, 30, { fit: [120, 56] });
      } catch {
        /* an unreadable logo just leaves the header without one */
      }
    } else {
      write(profile.legalName ?? profile.name, M, 40, { w: W * 0.5, bold: true, size: BIG, oneLine: true });
    }
    write("QUOTATION", M + W * 0.5, 30, { w: W * 0.5, align: "right", color: GREY, spacing: 3, oneLine: true });
    write(it.refNo, M + W * 0.5, 46, { w: W * 0.5, align: "right", bold: true, size: BIG, oneLine: true });
    write(`${dateTime.format(new Date(it.createdAt)).replace(",", "")}${it.validUntil ? `   ·   Valid till ${fmtDate(it.validUntil)}` : ""}`, M + W * 0.5, 68, { w: W * 0.5, align: "right", color: GREY, oneLine: true });
    doc.y = 104;

    // ── Prepared for / from ───────────────────────────────────────────────
    const customerName = customer?.fullName ?? it.customer?.fullName ?? "—";
    const half = W / 2;
    const contact = [profile.phones.join("  ·  "), profile.email, profile.gstin && `GST ${profile.gstin}`, profile.pan && `PAN ${profile.pan}`].filter(Boolean) as string[];
    const fromText = [profile.address ?? "", ...contact].filter(Boolean).join("\n");
    const leftH = 18 + heightOf(customerName, half - PAD * 2, true, BIG) + (customer?.phone ? 16 : 0);
    const rightH = 18 + heightOf(profile.legalName ?? profile.name, half - PAD * 2, true) + heightOf(fromText, half - PAD * 2);
    const partiesH = Math.max(leftH, rightH) + PAD * 2;
    const py = doc.y;
    rect(M, py, W, partiesH);
    vlines([M + half], py, partiesH);
    write("Prepared for", M + PAD, py + PAD, { w: half - PAD * 2, color: GREY, oneLine: true });
    write(customerName, M + PAD, py + PAD + 16, { w: half - PAD * 2, bold: true, size: BIG });
    if (customer?.phone) write(customer.phone, M + PAD, py + PAD + 16 + heightOf(customerName, half - PAD * 2, true, BIG) + 2, { w: half - PAD * 2, color: GREY, oneLine: true });
    write("From", M + half + PAD, py + PAD, { w: half - PAD * 2, color: GREY, oneLine: true });
    write(profile.legalName ?? profile.name, M + half + PAD, py + PAD + 16, { w: half - PAD * 2, bold: true });
    write(fromText, M + half + PAD, py + PAD + 16 + heightOf(profile.legalName ?? profile.name, half - PAD * 2, true) + 2, { w: half - PAD * 2, color: GREY });
    doc.y = py + partiesH;

    // ── The trip in a few lines ───────────────────────────────────────────
    const travellers = [it.adults ? `${it.adults} adult${it.adults > 1 ? "s" : ""}` : "", it.children ? `${it.children} child${it.children > 1 ? "ren" : ""}` : ""].filter(Boolean).join(", ");
    const facts: [string, string][] = (
      [
        ["Tour", it.title],
        ["Destination", it.destination ?? ""],
        ["Travel dates", it.travelFrom ? `${fmtDate(it.travelFrom)}${it.travelTo ? ` to ${fmtDate(it.travelTo)}` : ""}` : ""],
        ["Travellers", travellers],
        ["Trip", [PRODUCT_TYPE_LABELS[it.productType], TRIP_TYPE_LABELS[it.tripType]].join(" · ")],
        ["Relationship manager", owner?.name ? `Mr. ${owner.name.replace(/^Mr\.?\s*/i, "")}` : ""],
      ] as [string, string][]
    ).filter(([, v]) => v);
    const cw = W / 3;
    for (let i = 0; i < facts.length; i += 3) {
      const row = facts.slice(i, i + 3);
      const h = Math.max(...row.map(([, v]) => heightOf(v, cw - PAD * 2, true))) + 16 + PAD * 2;
      ensure(h);
      const y0 = doc.y;
      rect(M, y0, W, h);
      vlines([M + cw, M + cw * 2].filter((_, j) => j < row.length - 1 || row.length === 3), y0, h);
      row.forEach(([k, v], j) => {
        write(k, M + j * cw + PAD, y0 + PAD, { w: cw - PAD * 2, color: GREY, oneLine: true });
        write(v, M + j * cw + PAD, y0 + PAD + 16, { w: cw - PAD * 2, bold: true });
      });
      doc.y = y0 + h;
    }

    if (it.subject || it.quoteDescription) {
      const parts = [it.subject ? { text: it.subject, bold: true, color: BLACK } : null, it.quoteDescription ? { text: it.quoteDescription, bold: false, color: GREY } : null].filter(Boolean) as { text: string; bold: boolean; color: string }[];
      const h = parts.reduce((n, p) => n + heightOf(p.text, W - PAD * 2, p.bold) + 4, 0) + PAD * 2 + (it.subject ? 16 : 0);
      ensure(h);
      const y0 = doc.y;
      rect(M, y0, W, h);
      let cy = y0 + PAD;
      if (it.subject) {
        write("Subject", M + PAD, cy, { w: W - PAD * 2, color: GREY, oneLine: true });
        cy += 16;
      }
      for (const p of parts) {
        write(p.text, M + PAD, cy, { w: W - PAD * 2, bold: p.bold, color: p.color });
        cy += heightOf(p.text, W - PAD * 2, p.bold) + 4;
      }
      doc.y = y0 + h;
    }

    // ── Pricing ───────────────────────────────────────────────────────────
    section("Pricing");
    const wNo = 26;
    const wQty = breakup ? 32 : 60;
    const wPrice = breakup ? 68 : 0;
    const wLess = breakup ? 56 : 0;
    const wTax = breakup ? 54 : 0;
    const wTotal = breakup ? 78 : 0;
    const wName = W - wNo - wQty - wPrice - wLess - wTax - wTotal;
    const pc = [
      { label: "No", w: wNo, align: "left" as const },
      { label: "Item", w: wName, align: "left" as const },
      { label: "Qty", w: wQty, align: "right" as const },
      ...(breakup ? [{ label: "Price", w: wPrice, align: "right" as const }, { label: "Less", w: wLess, align: "right" as const }, { label: "Tax", w: wTax, align: "right" as const }, { label: "Total", w: wTotal, align: "right" as const }] : []),
    ];
    const pxs: number[] = [];
    let pacc = M;
    for (const c of pc) {
      pxs.push(pacc);
      pacc += c.w;
    }
    const pricingHead = () => {
      const y0 = doc.y;
      const h = SIZE + PAD * 2 + 2;
      rect(M, y0, W, h);
      vlines(pxs.slice(1), y0, h);
      pc.forEach((c, i) => write(c.label, pxs[i]! + PAD, y0 + PAD, { w: c.w - PAD * 2, bold: true, align: c.align, oneLine: true }));
      doc.y = y0 + h;
    };
    pricingHead();
    it.lines.forEach((l, i) => {
      const detail = l.detail ?? "";
      // What the supplier actually billed, for a foreign-currency line — informational only; unitPrice (INR) is the figure everything uses.
      const fxNote = breakup && l.currency && l.currency !== "INR" && l.foreignAmount != null && l.fxRate ? `${l.currency} ${l.foreignAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ ${moneyExact(l.fxRate)}/${l.currency}` : "";
      const inner = wName - PAD * 2;
      const th = heightOf(l.description, inner, true);
      const dh = detail ? heightOf(detail, inner) + 2 : 0;
      const fh = fxNote ? heightOf(fxNote, inner) + 2 : 0;
      const taxLabel = (l.taxPercent ?? 0) > 0 ? 14 : 0;
      const h = Math.max(th + dh + fh + PAD * 2, SIZE + PAD * 2 + taxLabel + 2);
      // The last item travels with the totals, so a page never starts with a total and no items above it.
      if (doc.y + h + (i === it.lines.length - 1 ? 110 : 0) > BOTTOM) {
        doc.addPage();
        pricingHead();
      }
      const y0 = doc.y;
      rect(M, y0, W, h);
      vlines(pxs.slice(1), y0, h);
      const amount = l.quantity * l.unitPrice;
      const tax = Math.round((Math.max(0, amount - (l.discount ?? 0)) * (l.taxPercent ?? 0)) / 100);
      write(String(i + 1), pxs[0]! + PAD, y0 + PAD, { w: wNo - PAD * 2, color: GREY, oneLine: true });
      write(l.description, pxs[1]! + PAD, y0 + PAD, { w: inner, bold: true });
      if (detail) write(detail, pxs[1]! + PAD, y0 + PAD + th + 2, { w: inner, color: GREY });
      if (fxNote) write(fxNote, pxs[1]! + PAD, y0 + PAD + th + dh + 2, { w: inner, color: GREY });
      write(String(l.quantity), pxs[2]! + PAD, y0 + PAD, { w: wQty - PAD * 2, align: "right", oneLine: true });
      if (breakup) {
        write(money(l.unitPrice), pxs[3]! + PAD, y0 + PAD, { w: wPrice - PAD * 2, align: "right", oneLine: true });
        write(l.discount ? money(l.discount) : "—", pxs[4]! + PAD, y0 + PAD, { w: wLess - PAD * 2, align: "right", color: l.discount ? BLACK : GREY, oneLine: true });
        write(tax ? money(tax) : "—", pxs[5]! + PAD, y0 + PAD, { w: wTax - PAD * 2, align: "right", color: tax ? BLACK : GREY, oneLine: true });
        if ((l.taxPercent ?? 0) > 0) write(`${l.taxPercent}%`, pxs[5]! + PAD, y0 + PAD + 14, { w: wTax - PAD * 2, align: "right", color: GREY, oneLine: true });
        write(money(lineTotal(l)), pxs[6]! + PAD, y0 + PAD, { w: wTotal - PAD * 2, align: "right", bold: true, oneLine: true });
      }
      doc.y = y0 + h;
    });
    if (it.lines.length === 0) {
      const y0 = doc.y;
      rect(M, y0, W, 30);
      write("No items priced yet.", M + PAD, y0 + PAD + 2, { w: W - PAD * 2, color: GREY, oneLine: true });
      doc.y = y0 + 30;
    }

    // ── Totals ────────────────────────────────────────────────────────────
    ensure(110);
    doc.y += 12;
    const subTotal = it.lines.reduce((n, l) => n + lineTotal(l), 0);
    const tw = 270;
    const tx = M + W - tw;
    const labelW = 120;
    const rowsT: { label: string; value: string; big?: boolean }[] = breakup ? [{ label: "Sub total", value: money(subTotal) }, ...(it.adjustment ? [{ label: "Adjustment", value: money(it.adjustment) }] : []), { label: "Total", value: money(it.totalPrice), big: true }] : [{ label: "Package price", value: money(it.totalPrice), big: true }];
    for (const r of rowsT) {
      const h = r.big ? BIG + PAD * 2 + 2 : SIZE + PAD * 2 + 2;
      const y0 = doc.y;
      rect(tx, y0, tw, h);
      vlines([tx + labelW], y0, h);
      write(r.label, tx + PAD, y0 + PAD + (r.big ? 2 : 0), { w: labelW - PAD * 2, bold: r.big, oneLine: true });
      write(r.value, tx + labelW + PAD, y0 + PAD, { w: tw - labelW - PAD * 2, align: "right", bold: r.big, size: r.big ? BIG : SIZE, oneLine: true });
      doc.y = y0 + h;
    }
    doc.y += 4;

    // ── Payment schedule ──────────────────────────────────────────────────
    const schedule = it.paymentSchedule.map((p) => [p.label, p.dueDate ? fmtDate(p.dueDate) : "", money(p.amount)]);
    if (it.fullPaymentDueDate) schedule.push(["Full payment due", fmtDate(it.fullPaymentDueDate), money(it.totalPrice)]);
    if (schedule.length) {
      section("Payment schedule");
      table([{ label: "Payment", width: W * 0.45 }, { label: "Due date", width: W * 0.3 }, { label: "Amount", width: W * 0.25, align: "right" }], schedule);
    }

    // ── Flights and hotels, when they were filled in ──────────────────────
    if (it.flights.length) {
      section("Flights");
      const fw = [58, 58, 56, 56, 56, 54, 46, 44];
      table(
        [
          { label: "Trip", width: fw[0]! },
          { label: "From", width: fw[1]! },
          { label: "Departs", width: fw[2]! },
          { label: "To", width: fw[3]! },
          { label: "Arrives", width: fw[4]! },
          { label: "Airline", width: fw[5]! },
          { label: "Hand bag", width: fw[6]! },
          { label: "Bag", width: fw[7]! },
          { label: "Zamzam", width: W - fw.reduce((a, b) => a + b, 0) },
        ],
        it.flights.map((f) => [f.tripType, f.departureCity, f.departureAt, f.arrivalCity, f.arrivalAt, f.airline, f.handCarry, f.checkInBaggage, f.zamzam]),
      );
    }
    if (it.hotels.length) {
      section("Hotels");
      table(
        [{ label: "City", width: W * 0.16 }, { label: "Hotel", width: W * 0.27 }, { label: "From Haram", width: W * 0.17 }, { label: "Check-in", width: W * 0.2 }, { label: "Check-out", width: W * 0.2 }],
        it.hotels.map((h) => [h.city, h.hotel, h.distanceFromHaram, h.checkIn, h.checkOut]),
      );
    }

    // ── Day by day ────────────────────────────────────────────────────────
    if (it.days.length) {
      section("Day by day");
      table([{ label: "Day", width: 50 }, { label: "Title", width: 150 }, { label: "Details", width: W - 200 }], it.days.map((d) => [String(d.day), d.title, d.description]));
    }

    // ── Inclusions, exclusions and notes ──────────────────────────────────
    for (const [title, items] of [["Inclusions", it.inclusions], ["Exclusions", it.exclusions]] as const) {
      if (!items.length) continue;
      listTable(title, [...items]);
    }
    if (it.quoteNotes) listTable("Notes", [it.quoteNotes]);

    // ── How to pay, and what we need ──────────────────────────────────────
    const bank: [string, string | null][] = [["Beneficiary", profile.bank.beneficiary], ["Bank", profile.bank.bankName], ["Account no.", profile.bank.accountNo], ["IFSC", profile.bank.ifsc], ["Branch", profile.bank.branch]];
    const bankRows = bank.filter(([, v]) => v) as [string, string][];
    if (bankRows.length || profile.upiId || profile.documentsRequired.length) {
      section("Payment details");
      ensure(130);
      const y0 = doc.y;
      const bw = profile.upiId ? W * 0.55 : W;
      let by = y0;
      if (bankRows.length) {
        const hh = SIZE + PAD * 2 + 2;
        rect(M, by, bw, hh);
        write("Bank transfer", M + PAD, by + PAD, { w: bw - PAD * 2, bold: true, oneLine: true });
        by += hh;
        for (const [k, v] of bankRows) {
          const h = Math.max(heightOf(v, bw * 0.62 - PAD * 2), SIZE) + PAD * 2;
          rect(M, by, bw, h);
          vlines([M + bw * 0.38], by, h);
          write(k, M + PAD, by + PAD, { w: bw * 0.38 - PAD * 2, color: GREY, oneLine: true });
          write(v, M + bw * 0.38 + PAD, by + PAD, { w: bw * 0.62 - PAD * 2, bold: true });
          by += h;
        }
      }
      if (profile.upiId) {
        const ux = M + (bankRows.length ? bw : 0);
        const uw = W - (bankRows.length ? bw : 0);
        const uh = Math.max(by - y0, 96);
        rect(ux, y0, uw, uh);
        const png = await QRCode.toBuffer(`upi://pay?pa=${encodeURIComponent(profile.upiId)}&pn=${encodeURIComponent(profile.name)}&cu=INR`, { margin: 1, width: 240 });
        doc.image(png, ux + PAD + 2, y0 + PAD + 2, { width: 78 });
        write("Pay by UPI", ux + PAD + 92, y0 + PAD + 2, { w: uw - 92 - PAD * 2, bold: true, oneLine: true });
        write(profile.upiId, ux + PAD + 92, y0 + PAD + 20, { w: uw - 92 - PAD * 2, oneLine: true });
        write("Scan with any UPI app", ux + PAD + 92, y0 + PAD + 38, { w: uw - 92 - PAD * 2, color: GREY });
        by = Math.max(by, y0 + uh);
      }
      doc.y = by;
      if (profile.documentsRequired.length) {
        listTable("Documents required", profile.documentsRequired);
      }
    }

    // ── Terms ─────────────────────────────────────────────────────────────
    if (it.terms) {
      section("Terms & conditions");
      for (const t of it.terms.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const isTitle = /^\d+\.\s+\S/.test(t) && t.length < 70;
        const h = heightOf(t, W, isTitle) + (isTitle ? 8 : 2);
        ensure(h);
        if (isTitle) doc.y += 6;
        write(t, M, doc.y, { w: W, bold: isTitle, color: isTitle ? BLACK : GREY });
        doc.y += isTitle ? 2 : 2;
      }
    }

    // ── Page footer ───────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // The footer sits inside the bottom margin; without this pdfkit would start a new page for it.
      doc.page.margins.bottom = 0;
      doc.moveTo(M, doc.page.height - 40).lineTo(M + W, doc.page.height - 40).lineWidth(0.6).strokeColor(GREY).stroke();
      write(`${profile.name}  ·  ${it.refNo}  ·  Computer-generated, no signature needed`, M, doc.page.height - 30, { w: W - 90, color: GREY, oneLine: true });
      write(`Page ${i + 1} of ${range.count}`, M + W - 90, doc.page.height - 30, { w: 90, align: "right", color: GREY, oneLine: true });
    }

    doc.end();
    return { fileName: `${it.refNo}${breakup ? "" : "-package-price"}.pdf`, data: await done };
  }
}
