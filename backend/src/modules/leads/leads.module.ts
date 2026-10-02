import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { CustomersModule } from "../customers/customers.module";
import { ItinerariesModule } from "../itineraries/itineraries.module";
import { AdminEnquiriesController } from "./admin/admin-enquiries.controller";
import { AdminInboundEventsController } from "./admin/admin-inbound-events.controller";
import { AdminLeadsController } from "./admin/admin-leads.controller";
import { B2BLeadsController } from "./b2b/b2b-leads.controller";
import { B2CTripRequestsController } from "./b2c/b2c-trip-requests.controller";
import { EnquiriesService } from "./domain/enquiries.service";
import { InboundEventsService } from "./domain/inbound-events.service";
import { LeadIntakeService } from "./domain/lead-intake.service";
import { LeadsService } from "./domain/leads.service";
import { PublicEnquiriesController } from "./public/public-enquiries.controller";

/** M02 · Leads & pipeline + website enquiry intake, B2B enquiries and B2C trip requests. */
@Module({
  imports: [ActivitiesModule, CustomersModule, ItinerariesModule],
  controllers: [AdminLeadsController, AdminEnquiriesController, AdminInboundEventsController, B2BLeadsController, B2CTripRequestsController, PublicEnquiriesController],
  providers: [LeadsService, EnquiriesService, LeadIntakeService, InboundEventsService],
  exports: [LeadsService, EnquiriesService, LeadIntakeService],
})
export class LeadsModule {}
