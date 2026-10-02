import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./core/auth/auth.module";
import { validateEnv } from "./core/config/env";
import { CoreModule } from "./core/core.module";
import { FeatureGuard } from "./core/features/feature.guard";
import { FeaturesController } from "./core/features/features.controller";
import { HttpExceptionFilter } from "./core/http/http-exception.filter";
import { HealthController } from "./modules/health/health.controller";
import { AdministrationModule } from "./modules/administration/administration.module";
import { ActivitiesModule } from "./modules/activities/activities.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CompanyModule } from "./modules/company/company.module";
import { CurrenciesModule } from "./modules/currencies/currencies.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { InvoicesModule } from "./modules/invoices/invoices.module";
import { ItinerariesModule } from "./modules/itineraries/itineraries.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { PartnersModule } from "./modules/partners/partners.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SearchModule } from "./modules/search/search.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { TripExperienceModule } from "./modules/trip-experience/trip-experience.module";
import { UsersModule } from "./modules/users/users.module";
import { WalletModule } from "./modules/wallet/wallet.module";

const isProduction = process.env.NODE_ENV === "production";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: isProduction ? "info" : "debug",
        redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
        transport: isProduction ? undefined : { target: "pino-pretty", options: { singleLine: true } },
        genReqId: (req) => (req.headers["x-request-id"] as string) ?? crypto.randomUUID(),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    CoreModule,
    AuthModule,
    // ─── Business modules (one per roadmap module) ───
    UsersModule,
    ActivitiesModule,
    TasksModule,
    CustomersModule,
    LeadsModule,
    CatalogModule,
    InventoryModule,
    PricingModule,
    WalletModule,
    PartnersModule,
    PaymentsModule,
    BookingsModule,
    DashboardModule,
    ReportsModule,
    ItinerariesModule,
    SearchModule,
    AdministrationModule,
    CompanyModule,
    CurrenciesModule,
    InvoicesModule,
    ContactsModule,
    TripExperienceModule,
  ],
  controllers: [HealthController, FeaturesController],
  providers: [
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
