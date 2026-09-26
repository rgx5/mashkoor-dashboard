import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { BookingsModule } from "../bookings/bookings.module";
import { CustomersModule } from "../customers/customers.module";
import { ItinerariesModule } from "../itineraries/itineraries.module";
import { PaymentsModule } from "../payments/payments.module";
import { AdminDocumentsController, AdminTripUpdatesController } from "./admin/admin-trip-experience.controller";
import { B2BTripExperienceController } from "./b2b/b2b-trip-experience.controller";
import { B2CHomeController, B2CItineraryChangesController, B2CTripExperienceController } from "./b2c/b2c-trip-experience.controller";
import { BookingDocumentsService } from "./domain/booking-documents.service";
import { CustomerPortalService } from "./domain/customer-portal.service";
import { TripUpdatesService } from "./domain/trip-updates.service";

/**
 * The connected customer experience: trip updates, documents, the B2C home/timeline, cancellation requests and
 * post-trip reviews. Sits on top of Bookings, Itineraries, Customers and Payments rather than the other way round.
 */
@Module({
  imports: [ActivitiesModule, BookingsModule, CustomersModule, ItinerariesModule, PaymentsModule],
  controllers: [AdminTripUpdatesController, AdminDocumentsController, B2BTripExperienceController, B2CHomeController, B2CTripExperienceController, B2CItineraryChangesController],
  providers: [TripUpdatesService, BookingDocumentsService, CustomerPortalService],
  exports: [TripUpdatesService, BookingDocumentsService, CustomerPortalService],
})
export class TripExperienceModule {}
