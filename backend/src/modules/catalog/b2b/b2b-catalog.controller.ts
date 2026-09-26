import { Get, Param, Query } from "@nestjs/common";
import { z } from "zod";
import { PRODUCT_TYPES } from "@mashkoor/shared";
import { PortalController } from "../../../core/auth/decorators";
import { AppError } from "../../../core/http/app-error";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { DestinationsService } from "../domain/destinations.service";
import { FaqsService } from "../domain/faqs.service";
import { PackagesService } from "../domain/packages.service";
import { TestimonialsService } from "../domain/testimonials.service";

const packagesQuery = z.object({ productType: z.enum(PRODUCT_TYPES).optional(), destinationId: z.uuid().optional() });

/** `/api/v1/b2b/catalog` — the same published content the website shows, for agents building a quote. */
@PortalController("b2b", "catalog")
export class B2BCatalogController {
  constructor(
    private readonly destinations: DestinationsService,
    private readonly packages: PackagesService,
    private readonly testimonials: TestimonialsService,
    private readonly faqs: FaqsService,
  ) {}

  @Get("destinations")
  destinationsList() {
    return this.destinations.listPublished();
  }

  @Get("packages")
  packagesList(@Query(new ZodPipe(packagesQuery)) query: z.output<typeof packagesQuery>) {
    return this.packages.listPublished(query);
  }

  @Get("packages/:slug")
  async getPackage(@Param("slug") slug: string) {
    const pkg = await this.packages.getBySlug(slug);
    if (!pkg) throw AppError.notFound("Package");
    return pkg;
  }

  @Get("testimonials")
  testimonialsList() {
    return this.testimonials.listPublished();
  }

  @Get("faqs")
  faqsList() {
    return this.faqs.listPublished();
  }
}
