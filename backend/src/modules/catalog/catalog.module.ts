import { Module } from "@nestjs/common";
import { AdminDestinationsController } from "./admin/admin-destinations.controller";
import { AdminFaqsController } from "./admin/admin-faqs.controller";
import { AdminPackageDeparturesController } from "./admin/admin-package-departures.controller";
import { AdminPackagesController } from "./admin/admin-packages.controller";
import { AdminTestimonialsController } from "./admin/admin-testimonials.controller";
import { B2BCatalogController } from "./b2b/b2b-catalog.controller";
import { DestinationsService } from "./domain/destinations.service";
import { FaqsService } from "./domain/faqs.service";
import { PackageDeparturesService } from "./domain/package-departures.service";
import { PackagesService } from "./domain/packages.service";
import { TestimonialsService } from "./domain/testimonials.service";
import { PublicCatalogController } from "./public/public-catalog.controller";
import { PublicCatalogService } from "./public/public-catalog.service";

/** M04 · Catalog: destinations, packages, testimonials, FAQs. Admin content editors, the B2B browse slice, and the public API the website reads. */
@Module({
  controllers: [AdminDestinationsController, AdminPackagesController, AdminPackageDeparturesController, AdminTestimonialsController, AdminFaqsController, B2BCatalogController, PublicCatalogController],
  providers: [DestinationsService, PackagesService, PackageDeparturesService, TestimonialsService, FaqsService, PublicCatalogService],
  exports: [DestinationsService, PackagesService, PackageDeparturesService, TestimonialsService, FaqsService],
})
export class CatalogModule {}
