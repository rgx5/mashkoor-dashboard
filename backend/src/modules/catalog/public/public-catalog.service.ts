import { Injectable } from "@nestjs/common";
import { PRODUCT_TYPE_LABELS, type PackageDayPlan, type PackageHotelStay, type PackagePriceTier } from "@mashkoor/shared";
import type { Destination, Faq, Package, PackageDeparture, Testimonial } from "@prisma/client";
import { PrismaService } from "../../../core/prisma/prisma.service";

/**
 * Shapes the public website understands (website/src/lib/types.ts). Kept separate from the dashboard's own DTOs on
 * purpose: this is a public contract — no ids, no internal reference codes, no cost — so it changes only deliberately.
 */
type SiteProductType = "HOLIDAY" | "VISA" | "FLIGHT" | "HOTEL" | "OTHER";
const SITE_PRODUCT_TYPES = new Set<string>(["HOLIDAY", "VISA", "FLIGHT", "HOTEL"]);
const siteProductType = (type: string): SiteProductType => (SITE_PRODUCT_TYPES.has(type) ? (type as SiteProductType) : "OTHER");

// "hajj-umrah" isn't reachable from here — Hajj/Umrah is no longer a dashboard ProductType (it's the trip's
// destination/package content, classified generically as HOLIDAY or PACKAGE). A pilgrimage destination still links to
// the website's hajj-umrah service page via its category instead — see `toDestination`.
const SERVICE_FOR_PRODUCT: Record<string, string> = { HOLIDAY: "customized-travel", PACKAGE: "customized-travel", VISA: "visa-assistance", FLIGHT: "flight-assistance", HOTEL: "hotel-accommodation" };

const FAQ_CATEGORIES = new Map([
  ["general", "general"],
  ["hajj", "hajj-umrah"],
  ["umrah", "hajj-umrah"],
  ["hajj-umrah", "hajj-umrah"],
  ["booking", "booking"],
  ["payment", "booking"],
  ["b2b", "b2b"],
  ["partner", "b2b"],
  ["agent", "b2b"],
  ["visa", "visa"],
]);

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const imageOf = (src: string | null, alt: string) => (src ? { src, alt } : undefined);

export interface SitePackage {
  slug: string;
  title: string;
  productType: SiteProductType;
  category: string;
  destinationSlugs: string[];
  summary: string;
  overview: string;
  durationDays: number;
  durationNights: number;
  departureCity: string;
  validity: string;
  priceFrom?: number;
  priceBasis?: string;
  highlights: string[];
  itinerary: PackageDayPlan[];
  inclusions: string[];
  exclusions: string[];
  hotels: { city: string; name: string; note?: string }[];
  notes: string[];
  image?: { src: string; alt: string };
  featured: boolean;
  seo: { title?: string; description?: string };
  /** Fixed dates this package can be booked and paid for directly, on the ones still open for sale. Empty for a custom/FIT trip — it stays enquiry-only. */
  departures: { id: string; departureDate: string; returnDate: string | null; pricePerHead: number; depositPerHead: number | null; seatsLeft: number }[];
}

type PackageWithDestination = Package & { destination: Pick<Destination, "slug"> | null; departures?: PackageDeparture[] };

const toSiteDeparture = (d: PackageDeparture) => ({
  id: d.id,
  departureDate: d.departureDate.toISOString().slice(0, 10),
  returnDate: d.returnDate ? d.returnDate.toISOString().slice(0, 10) : null,
  pricePerHead: d.pricePerHead,
  depositPerHead: d.depositPerHead,
  seatsLeft: Math.max(0, d.totalSeats - d.bookedSeats),
});

@Injectable()
export class PublicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Packages ─────────────────────────────────────────────────────────────

  private toPackage(p: PackageWithDestination): SitePackage {
    const now = Date.now();
    const tiers = ((p.priceTiers as unknown as PackagePriceTier[]) ?? []).filter((t) => !t.validTo || new Date(t.validTo).getTime() >= now);
    const cheapest = tiers.length ? Math.min(...tiers.map((t) => t.adultPrice)) : undefined;
    const lastValid = tiers.map((t) => t.validTo).filter((d): d is string => Boolean(d)).sort().at(-1);
    const hotels = (p.hotels as unknown as PackageHotelStay[]) ?? [];
    return {
      slug: p.slug,
      title: p.title,
      productType: siteProductType(p.productType),
      category: PRODUCT_TYPE_LABELS[p.productType],
      destinationSlugs: p.destination ? [p.destination.slug] : [],
      summary: p.summary ?? "",
      overview: p.description ?? p.summary ?? "",
      durationDays: p.days,
      durationNights: p.nights,
      departureCity: "Mumbai",
      validity: lastValid ? `Prices valid until ${dateFmt.format(new Date(lastValid))}` : "",
      priceFrom: cheapest,
      priceBasis: cheapest != null ? "per adult" : undefined,
      highlights: p.highlights,
      itinerary: (p.itinerary as unknown as PackageDayPlan[]) ?? [],
      inclusions: p.inclusions,
      exclusions: p.exclusions,
      hotels: hotels.map((h) => ({ city: h.city, name: h.hotelName, note: [`${h.nights} night${h.nights === 1 ? "" : "s"}`, h.roomType, h.mealPlan].filter(Boolean).join(" · ") })),
      notes: [],
      image: imageOf(p.heroImageUrl, p.title),
      featured: p.featured,
      seo: { title: p.seoTitle ?? undefined, description: p.seoDescription ?? undefined },
      departures: (p.departures ?? []).map(toSiteDeparture),
    };
  }

  async listPackages(filters: { productType?: string; destinationSlug?: string; featured?: boolean } = {}): Promise<{ data: SitePackage[] }> {
    const rows = await this.prisma.package.findMany({
      where: {
        published: true,
        productType: filters.productType as never,
        featured: filters.featured,
        destination: filters.destinationSlug ? { slug: filters.destinationSlug } : undefined,
      },
      include: { destination: { select: { slug: true } } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    return { data: rows.map((p) => this.toPackage(p)) };
  }

  async getPackage(slug: string): Promise<SitePackage | null> {
    const row = await this.prisma.package.findFirst({
      where: { slug, published: true },
      include: { destination: { select: { slug: true } }, departures: { where: { active: true, departureDate: { gte: new Date() } }, orderBy: { departureDate: "asc" } } },
    });
    return row ? this.toPackage(row) : null;
  }

  // ─── Destinations ─────────────────────────────────────────────────────────

  private toDestination(d: Destination, productTypes: string[], featured: boolean) {
    const country = d.country.trim();
    const category = /^india$/i.test(country) ? "India" : /saudi/i.test(country) || /makkah|madinah|mecca|medina/i.test(d.name) ? "Pilgrimage" : "International";
    return {
      slug: d.slug,
      name: d.name,
      country,
      category,
      summary: d.summary ?? "",
      intro: (d.description ?? "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
      // A highlight written as "Title — detail" becomes a titled card; a plain one is just a title.
      highlights: d.highlights.map((h) => {
        const [title, ...rest] = h.split(/\s[—–-]\s|:\s/);
        return { title: (title ?? h).trim(), description: rest.join(" — ").trim() };
      }),
      travelInfo: d.region ? [{ label: "Region", value: d.region }] : [],
      // A pilgrimage destination always links to the dedicated Hajj/Umrah service page, regardless of how its
      // packages happen to be classified internally (they're generic HOLIDAY/PACKAGE types, not a product type of
      // their own — see the note above SERVICE_FOR_PRODUCT).
      serviceSlugs: [...new Set([category === "Pilgrimage" ? "hajj-umrah" : null, ...productTypes.map((t) => SERVICE_FOR_PRODUCT[t])].filter((s): s is string => Boolean(s)))],
      image: imageOf(d.heroImageUrl, d.name),
      featured,
      seo: { title: d.seoTitle ?? undefined, description: d.seoDescription ?? undefined },
    };
  }

  private async destinationsWithTypes(where: { published: true; slug?: string }) {
    const rows = await this.prisma.destination.findMany({
      where,
      include: { packages: { where: { published: true }, select: { productType: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows;
  }

  async listDestinations() {
    const rows = await this.destinationsWithTypes({ published: true });
    // No "featured" flag exists in the dashboard yet, so the first six in the staff-chosen order are the featured ones.
    return { data: rows.map((d, i) => this.toDestination(d, d.packages.map((p) => p.productType), i < 6)) };
  }

  async getDestination(slug: string) {
    const [row] = await this.destinationsWithTypes({ published: true, slug });
    return row ? this.toDestination(row, row.packages.map((p) => p.productType), false) : null;
  }

  // ─── Testimonials & FAQs ──────────────────────────────────────────────────

  private toTestimonial(t: Testimonial) {
    return { name: t.customerName, city: t.location ?? "", trip: t.productType ? PRODUCT_TYPE_LABELS[t.productType] : "", quote: t.quote, rating: t.rating };
  }

  async listTestimonials() {
    const rows = await this.prisma.testimonial.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    return { data: rows.map((t) => this.toTestimonial(t)) };
  }

  private toFaq(f: Faq) {
    return { question: f.question, answer: f.answer, category: FAQ_CATEGORIES.get(f.category.trim().toLowerCase().replace(/[\s&/]+/g, "-")) ?? "general" };
  }

  async listFaqs() {
    const rows = await this.prisma.faq.findMany({ where: { published: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
    return { data: rows.map((f) => this.toFaq(f)) };
  }
}
