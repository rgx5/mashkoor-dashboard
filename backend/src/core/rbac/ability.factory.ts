import { Injectable } from "@nestjs/common";
import { AbilityBuilder, type PureAbility } from "@casl/ability";
import { createPrismaAbility, type PrismaQuery, type Subjects } from "@casl/prisma";
import type { AbilityRule, Role, StaffFeature } from "@mashkoor/shared";
import type {
  Activity,
  AuditLog,
  Booking,
  Contact,
  Currency,
  Customer,
  Destination,
  Enquiry,
  Faq,
  FinanceEntry,
  FlightSeatBlock,
  ForexTransaction,
  Hotel,
  InboundEvent,
  Invoice,
  Itinerary,
  Lead,
  NotificationLog,
  Package,
  Partner,
  PricingRule,
  RatePeriod,
  RoomType,
  Setting,
  Task,
  TransportOption,
  Testimonial,
  Traveler,
  User,
} from "@prisma/client";
import type { RequestUser } from "../auth/request-user";
import { featuresUsedBy, gateRules, type GateRule } from "./feature-gate";

export type Action =
  | "manage"
  | "create"
  | "read"
  | "update"
  | "delete"
  | "invite"
  | "disable"
  | "assign"
  | "merge"
  | "export"
  /** See unmasked sensitive fields, e.g. passport numbers. */
  | "reveal"
  /** Attach visas, tickets and vouchers to a booking. */
  | "attach"
  /** Post trip updates the customer or agency sees. */
  | "notify"
  /** Record and verify payments and issue payment links on a booking. */
  | "collect"
  /** Move money in a partner wallet (top-up, adjustment). */
  | "funds";

export type AppSubjects =
  | "all"
  | Subjects<{
      User: User;
      AuditLog: AuditLog;
      Setting: Setting;
      Customer: Customer;
      Traveler: Traveler;
      Lead: Lead;
      Activity: Activity;
      Task: Task;
      InboundEvent: InboundEvent;
      Destination: Destination;
      Package: Package;
      Testimonial: Testimonial;
      Faq: Faq;
      Hotel: Hotel;
      RoomType: RoomType;
      RatePeriod: RatePeriod;
      FlightSeatBlock: FlightSeatBlock;
      PricingRule: PricingRule;
      Booking: Booking;
      Partner: Partner;
      Itinerary: Itinerary;
      NotificationLog: NotificationLog;
      Contact: Contact;
      Currency: Currency;
      Enquiry: Enquiry;
      Invoice: Invoice;
      FinanceEntry: FinanceEntry;
      TransportOption: TransportOption;
      ForexTransaction: ForexTransaction;
    }>;

export type AppAbility = PureAbility<[Action, AppSubjects], PrismaQuery>;

/** Staff other than super admins are limited to the dashboard areas switched on for them. */
const isFeatureGated = (role: Role, portal: string) => portal === "admin" && role !== "SUPER_ADMIN" && role !== "PARTNER_ADMIN" && role !== "PARTNER_USER" && role !== "CUSTOMER";

/**
 * Permission rules per role (PROJECT_PLAN §3.2). Each business module adds its subjects here as it is built.
 * The same rules are sent to the frontend via `/auth/:portal/me` so the UI can hide what users can't do.
 * Record-level conditions are applied to queries with `accessibleBy()`.
 */
@Injectable()
export class AbilityFactory {
  forUser(user: RequestUser): AppAbility {
    const raw = this.roleRules(user);
    // Staff only get the areas a super admin has switched on for them; super admins, agencies and customers are untouched.
    const rules = isFeatureGated(user.role, user.portal) ? gateRules(raw as unknown as GateRule[], user.id, user.features) : raw;
    return createPrismaAbility<AppAbility>(rules as never);
  }

  /** The dashboard areas a role could use at all, whatever has been switched on — so the access matrix can grey out the rest. */
  featuresAvailableFor(role: Role, userId: string): StaffFeature[] {
    return featuresUsedBy(this.roleRules({ id: userId, portal: "admin", role, partnerId: null, customerId: null, features: [] }) as unknown as GateRule[], userId);
  }

  private roleRules(user: RequestUser) {
    const builder = new AbilityBuilder<AppAbility>(createPrismaAbility);
    const { can, cannot } = builder;

    switch (user.role) {
      case "SUPER_ADMIN":
        can("manage", "all");
        // Nobody disables or demotes themselves by accident.
        cannot("disable", "User", { id: user.id });
        break;

      case "OPS_MANAGER":
        can("read", "User", { type: "STAFF" });
        can("read", "AuditLog");
        can("read", "Setting");
        can(["read", "create", "update", "merge", "export"], "Customer");
        can(["read", "create", "update", "delete", "reveal"], "Traveler");
        can(["read", "create", "update", "assign", "export"], "Lead");
        can(["read", "create"], "Activity");
        can("manage", "Task");
        can(["read", "update"], "InboundEvent");
        can("manage", "Contact");
        // M04–M07: content, inventory and pricing are managed by ops; bookings are run by ops too.
        can("manage", "Destination");
        can("manage", "Package");
        can("manage", "Testimonial");
        can("manage", "Faq");
        can("manage", "Hotel");
        can("manage", "RoomType");
        can("manage", "RatePeriod");
        can("manage", "FlightSeatBlock");
        can("manage", "TransportOption");
        can("manage", "ForexTransaction");
        can("manage", "PricingRule");
        can("manage", "Currency");
        can("manage", "Enquiry");
        can("read", "Invoice");
        can("manage", "Booking");
        // M08–M09: partner directory, KYC review and wallet administration.
        can("manage", "Partner");
        // M10 + M12: itineraries and the email log.
        can("manage", "Itinerary");
        can("manage", "NotificationLog");
        break;

      case "SALES_AGENT":
        can("read", "User", { id: user.id });
        // Customers are shared across the sales team; deleting and merging is for managers.
        can(["read", "create", "update"], "Customer");
        can(["read", "create", "update", "reveal"], "Traveler");
        // Own leads plus the unassigned queue.
        can(["read", "update"], "Lead", { ownerId: user.id });
        can(["read", "update"], "Lead", { ownerId: null });
        can("create", "Lead");
        can(["read", "create"], "Activity");
        can(["read", "update"], "Task", { assigneeId: user.id });
        can("create", "Task");
        // The Contacts rolodex is shared by the whole team; deleting is for managers.
        can(["read", "create", "update"], "Contact");
        // Browses the catalog, inventory and price quotes to build a booking, but doesn't edit them.
        can("read", "Destination");
        can("read", "Package");
        can("read", "Testimonial");
        can("read", "Faq");
        can("read", "Hotel");
        can("read", "RoomType");
        can("read", "RatePeriod");
        can("read", "FlightSeatBlock");
        can("read", "TransportOption");
        can("read", "PricingRule");
        can("read", "Currency");
        // Raw enquiries: their own assigned ones, and they can note down a phone call or walk-in themselves.
        can(["read", "update"], "Enquiry", { ownerId: user.id });
        can("create", "Enquiry");
        // Own bookings plus the unassigned queue; cost/margin are hidden in the response, not by ability.
        can(["read", "create", "update", "attach", "notify", "collect"], "Booking", { ownerId: user.id });
        can(["read", "create", "update", "attach", "notify", "collect"], "Booking", { ownerId: null });
        // Own itineraries; shared templates have no owner.
        can(["read", "create", "update", "delete"], "Itinerary", { ownerId: user.id });
        can("read", "Itinerary", { ownerId: null });
        break;

      case "ACCOUNTS":
        // Money only: payments, receivables, wallets and the money reports. Cannot edit bookings, leads or the catalog.
        can("read", "User", { id: user.id });
        can("read", "Customer");
        can("read", "Traveler");
        can(["read", "create"], "Activity");
        can(["read", "update"], "Task", { assigneeId: user.id });
        can("create", "Task");
        can("read", "Booking");
        can("collect", "Booking");
        can("read", "Partner");
        can("funds", "Partner");
        can("manage", "Currency");
        // Leads handed over for payment, and the invoices raised for them.
        can("read", "Lead", { accountantId: user.id });
        can(["read", "create", "update"], "Invoice");
        // The accounts section: every rupee in and out, supplier payments and expenses. Entries are cancelled, never edited.
        can(["read", "create", "update"], "FinanceEntry");
        // The forex desk: sells currency to customers, buys stock from dealers, sets the rates.
        can("manage", "ForexTransaction");
        can("read", "Itinerary");
        can("read", "InboundEvent");
        break;

      case "VISA_DOCS":
        // Documents and travellers: visas, tickets, vouchers, passports. No prices or payments.
        can("read", "User", { id: user.id });
        can("read", "Customer");
        can(["read", "create", "update", "reveal"], "Traveler");
        can(["read", "create"], "Activity");
        can(["read", "update"], "Task", { assigneeId: user.id });
        can("create", "Task");
        can("read", "Booking");
        can(["attach", "notify"], "Booking");
        can("read", "Itinerary");
        break;

      case "SUPPORT":
        // Answers customers and agents: reads customers, leads and bookings, posts trip updates, logs notes.
        can("read", "User", { id: user.id });
        can(["read", "create", "update"], "Customer");
        can("read", "Traveler");
        can("read", "Lead");
        can(["read", "create"], "Activity");
        can(["read", "update"], "Task", { assigneeId: user.id });
        can("create", "Task");
        can(["read", "create", "update"], "Contact");
        can("read", "Booking");
        can("notify", "Booking");
        can("read", "Itinerary");
        break;

      case "CONTENT":
        // The public website's content only.
        can("read", "User", { id: user.id });
        can("manage", "Destination");
        can("manage", "Package");
        can("manage", "Testimonial");
        can("manage", "Faq");
        break;

      case "PARTNER_ADMIN":
      case "PARTNER_USER":
        if (user.partnerId) {
          if (user.role === "PARTNER_ADMIN") {
            can(["read", "create", "update", "invite", "disable"], "User", { partnerId: user.partnerId, type: "PARTNER" });
            cannot("disable", "User", { id: user.id });
          } else {
            can("read", "User", { partnerId: user.partnerId, type: "PARTNER" });
          }
          // Agency customers, enquiries and bookings — scoped to this partner only.
          can(["read", "create", "update"], "Customer", { partnerId: user.partnerId });
          can(["read", "create", "update"], "Traveler");
          can(["read", "create"], "Lead", { partnerId: user.partnerId });
          can(["read", "create", "update"], "Booking", { partnerId: user.partnerId });
          can(["read", "create"], "Activity");
          // Browsing the catalog and inventory to price a trip; no pricing-rule or cost visibility.
          can("read", "Destination");
          can("read", "Package");
          can("read", "Testimonial");
          can("read", "Faq");
          can("read", "Hotel");
          can("read", "RoomType");
          can("read", "RatePeriod");
          can("read", "FlightSeatBlock");
        }
        break;

      case "CUSTOMER":
        can("read", "User", { id: user.id });
        if (user.customerId) {
          can(["read", "update"], "Customer", { id: user.customerId });
          can(["read", "create", "update"], "Traveler");
          can(["read", "create"], "Lead", { customerId: user.customerId });
          can("read", "Booking", { customerId: user.customerId });
        }
        break;
    }

    return builder.rules;
  }

  /** Serialisable rules for the frontend. */
  rulesFor(user: RequestUser): AbilityRule[] {
    return this.forUser(user).rules as AbilityRule[];
  }
}
