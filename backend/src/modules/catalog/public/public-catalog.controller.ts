import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { PRODUCT_TYPES } from "@mashkoor/shared";
import { Public } from "../../../core/auth/decorators";
import { AppError } from "../../../core/http/app-error";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { PublicCatalogService } from "./public-catalog.service";
import { RequireFeatures } from "../../../core/features/require-features";

const packagesQuery = z.object({
  productType: z.enum(PRODUCT_TYPES).optional(),
  destination: z.string().trim().max(160).optional(),
  // "true" / "false" only: z.coerce.boolean() would read the string "false" as true.
  featured: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

/**
 * `/api/v1/public/*` — read-only, published content only, in the shapes the website expects (see PublicCatalogService).
 * Called server-side by the website; no auth. Lists come back as `{ data: [...] }`. No ids, cost or internal codes.
 */
@ApiTags("public · catalog")
@Public()
@Throttle({ default: { limit: 1200, ttl: 60_000 } })
@Controller("public")
@RequireFeatures("website")
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get("destinations")
  destinations() {
    return this.catalog.listDestinations();
  }

  @Get("destinations/:slug")
  async destination(@Param("slug") slug: string) {
    const destination = await this.catalog.getDestination(slug);
    if (!destination) throw AppError.notFound("Destination");
    return destination;
  }

  @Get("packages")
  packages(@Query(new ZodPipe(packagesQuery)) query: z.output<typeof packagesQuery>) {
    return this.catalog.listPackages({ productType: query.productType, destinationSlug: query.destination, featured: query.featured });
  }

  @Get("packages/:slug")
  async packageBySlug(@Param("slug") slug: string) {
    const pkg = await this.catalog.getPackage(slug);
    if (!pkg) throw AppError.notFound("Package");
    return pkg;
  }

  @Get("testimonials")
  testimonials() {
    return this.catalog.listTestimonials();
  }

  @Get("faqs")
  faqs() {
    return this.catalog.listFaqs();
  }
}
