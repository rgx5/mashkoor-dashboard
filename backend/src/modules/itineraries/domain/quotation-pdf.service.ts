import { Injectable } from "@nestjs/common";
import { PRODUCT_TYPE_LABELS, TRIP_TYPE_LABELS } from "@mashkoor/shared";
import type { RequestUser } from "../../../core/auth/request-user";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { CompanyService } from "../../company/company.service";
import { formatPdfDate, renderLineDocument, type LineDocument } from "./line-document-pdf";
import { ItinerariesService } from "./itineraries.service";

const dateTime = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/**
 * M10 · The quotation PDF for an itinerary. It carries everything on the itinerary — customer and trip summary, the priced items
 * (with or without a breakup), totals, payment schedule, flights, hotels, the day-by-day plan, inclusions, notes, bank and UPI
 * details and the terms — laid out by the same renderer the invoice uses.
 */
@Injectable()
export class QuotationPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itineraries: ItinerariesService,
    private readonly company: CompanyService,
  ) {}

  async render(actor: RequestUser, id: string, breakup = true): Promise<{ fileName: string; data: Buffer }> {
    const it = await this.itineraries.get(actor, id);
    // The customer when there is one; before Awaiting payment a lead has no customer yet, so "Prepared for" falls back to the lead's contact.
    const [profile, customer, lead] = await Promise.all([
      this.company.get(),
      it.customer ? this.prisma.customer.findUnique({ where: { id: it.customer.id }, select: { fullName: true, phone: true, email: true } }) : null,
      !it.customer && it.lead ? this.prisma.lead.findUnique({ where: { id: it.lead.id }, select: { contactName: true, phone: true, email: true } }) : null,
    ]);
    // The relationship manager chosen on the quotation, or whoever owns it.
    const owner = it.relationshipManager ?? it.owner;
    const travellers = [it.adults ? `${it.adults} adult${it.adults > 1 ? "s" : ""}` : "", it.children ? `${it.children} child${it.children > 1 ? "ren" : ""}` : ""].filter(Boolean).join(", ");

    const schedule = it.paymentSchedule.map((p) => ({ label: p.label, date: p.dueDate ? formatPdfDate(p.dueDate) : "", amount: p.amount }));
    if (it.fullPaymentDueDate) schedule.push({ label: "Full payment due", date: formatPdfDate(it.fullPaymentDueDate), amount: it.totalPrice });

    const document: LineDocument = {
      kind: "QUOTATION",
      refNo: it.refNo,
      headerNote: `${dateTime.format(new Date(it.createdAt)).replace(",", "")}${it.validUntil ? `   ·   Valid till ${formatPdfDate(it.validUntil)}` : ""}`,
      customerLabel: "Prepared for",
      customer: { name: customer?.fullName ?? lead?.contactName ?? it.customer?.fullName ?? "—", phone: customer?.phone ?? lead?.phone, email: customer?.email ?? lead?.email },
      facts: [
        ["Tour", it.title],
        ["Destination", it.destination ?? ""],
        ["Travel dates", it.travelFrom ? `${formatPdfDate(it.travelFrom)}${it.travelTo ? ` to ${formatPdfDate(it.travelTo)}` : ""}` : ""],
        ["Travellers", travellers],
        ["Trip", [PRODUCT_TYPE_LABELS[it.productType], TRIP_TYPE_LABELS[it.tripType]].join(" · ")],
        ["Relationship manager", owner?.name ? `Mr. ${owner.name.replace(/^Mr\.?\s*/i, "")}` : ""],
      ],
      subject: it.subject,
      description: it.quoteDescription,
      lines: it.lines,
      adjustment: it.adjustment,
      total: it.totalPrice,
      packageLabel: "Package price",
      schedule,
      flights: it.flights,
      hotels: it.hotels,
      hotelDistanceLabel: /makkah|madinah|mecca|medina|umrah|hajj/i.test(`${it.destination ?? ""} ${it.title}`) ? "From Haram" : "Distance",
      days: it.days,
      inclusions: it.inclusions,
      exclusions: it.exclusions,
      notes: it.quoteNotes,
      terms: it.terms,
      footer: `${profile.name}  ·  ${it.refNo}  ·  Computer-generated, no signature needed`,
    };
    const data = await renderLineDocument(profile, document, breakup, `Quotation ${it.refNo}`);
    return { fileName: `${it.refNo}${breakup ? "" : "-package-price"}.pdf`, data };
  }
}
