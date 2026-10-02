import { Injectable, Logger } from "@nestjs/common";
import { OPEN_LEAD_STAGES, PRODUCT_TYPE_LABELS, publicEnquirySchema, type LeadSource, type ProductType, type PublicEnquiry } from "@mashkoor/shared";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { fromDateOnly } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { SettingsService } from "../../../core/settings/settings.service";
import { ActivitiesService } from "../../activities/domain/activities.service";

export interface IntakeResult {
  /** A repeat contact is added to the lead already being worked; anything new is a raw enquiry for the admin to assign. */
  kind: "lead" | "enquiry";
  id: string;
  refNo: string;
  outcome: "created" | "appended" | "duplicate_event";
}

/**
 * Turns inbound enquiries (website today; WhatsApp / Instagram in Phase 4) into raw Enquiry records: store raw event →
 * append to the lead or enquiry already open for this phone number, or create an Enquiry → notify. Nobody has spoken to
 * them yet, so there are no requirements; the admin assigns it, the rep calls and converts it into a Lead.
 */
@Injectable()
export class LeadIntakeService {
  private readonly logger = new Logger(LeadIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly activities: ActivitiesService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async fromWebsite(enquiry: PublicEnquiry): Promise<IntakeResult> {
    // Identical submissions (double clicks, retries) within the same minute are recorded once.
    const minute = Math.floor(Date.now() / 60_000);
    const externalId = createHash("sha256")
      .update(JSON.stringify([enquiry.phone, enquiry.formType, enquiry.packageSlug, enquiry.requirements, minute]))
      .digest("hex")
      .slice(0, 40);

    let event;
    try {
      event = await this.prisma.inboundEvent.create({
        data: { channel: "WEBSITE", externalId, payload: enquiry as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.inboundEvent.findUnique({ where: { channel_externalId: { channel: "WEBSITE", externalId } } });
        const lead = existing?.leadId ? await this.prisma.lead.findUnique({ where: { id: existing.leadId } }) : null;
        if (lead) return { kind: "lead", id: lead.id, refNo: lead.refNo, outcome: "duplicate_event" };
        const enquiry = existing?.enquiryId ? await this.prisma.enquiry.findUnique({ where: { id: existing.enquiryId } }) : null;
        if (enquiry) return { kind: "enquiry", id: enquiry.id, refNo: enquiry.refNo, outcome: "duplicate_event" };
      }
      throw error;
    }

    try {
      const result = await this.process(enquiry, "WEBSITE", this.describeSource(enquiry));
      await this.prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), ...this.eventLink(result) } });
      return result;
    } catch (error) {
      await this.prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 1000) : String(error) } });
      throw error;
    }
  }

  /** Re-runs a stored website enquiry (one that failed, or was never finished) and records the outcome on the same event. */
  async replayWebsiteEvent(event: { id: string; payload: Prisma.JsonValue }): Promise<IntakeResult> {
    const parsed = publicEnquirySchema.safeParse(event.payload);
    if (!parsed.success) {
      const error = `Stored enquiry is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`.slice(0, 1000);
      await this.prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "FAILED", error } });
      throw AppError.conflict(error);
    }
    try {
      const result = await this.process(parsed.data, "WEBSITE", this.describeSource(parsed.data));
      await this.prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), ...this.eventLink(result), error: null } });
      return result;
    } catch (error) {
      await this.prisma.inboundEvent.update({ where: { id: event.id }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 1000) : String(error) } });
      throw error;
    }
  }

  private async process(enquiry: PublicEnquiry, source: LeadSource, sourceDetail: string): Promise<IntakeResult> {
    const dedupeDays = await this.settings.get("leads.dedupeWindowDays");
    const since = new Date(Date.now() - dedupeDays * 24 * 60 * 60 * 1000);
    const productType = enquiry.productType as ProductType;

    const customer = await this.prisma.customer.findFirst({
      where: { deletedAt: null, OR: [{ phone: enquiry.phone }, { altPhone: enquiry.phone }, ...(enquiry.email ? [{ email: enquiry.email }] : [])] },
      orderBy: { createdAt: "asc" },
    });

    const openLead = await this.prisma.lead.findFirst({
      where: {
        stage: { in: [...OPEN_LEAD_STAGES] },
        productType,
        createdAt: { gte: since },
        OR: [{ phone: enquiry.phone }, ...(customer ? [{ customerId: customer.id }] : [])],
      },
      orderBy: { createdAt: "desc" },
    });

    const summary = this.summarize(enquiry, sourceDetail);

    if (openLead) {
      await this.prisma.$transaction(async (tx) => {
        await this.activities.record({ entityType: "LEAD", entityId: openLead.id, customerId: openLead.customerId, type: "SYSTEM", body: `New enquiry received again\n${summary}`, meta: { source, sourceDetail } }, tx);
        // Bring it back to the top of the owner's list.
        await tx.lead.update({ where: { id: openLead.id }, data: { priority: "HOT", nextFollowUpAt: new Date() } });
      });
      await this.notifyOwner(openLead.ownerId, openLead.refNo, enquiry.contactName, "repeat");
      return { kind: "lead", id: openLead.id, refNo: openLead.refNo, outcome: "appended" };
    }

    // Someone who enquired and hasn't been called yet doesn't get a second record — their message is added to the first.
    const openEnquiry = await this.prisma.enquiry.findFirst({ where: { phone: enquiry.phone, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
    if (openEnquiry) {
      const stamp = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date());
      await this.prisma.enquiry.update({ where: { id: openEnquiry.id }, data: { message: [openEnquiry.message, `[${stamp}] ${this.messageOf(enquiry)}`].filter(Boolean).join("\n\n") } });
      await this.notifyOwner(openEnquiry.ownerId, openEnquiry.refNo, enquiry.contactName, "repeat");
      return { kind: "enquiry", id: openEnquiry.id, refNo: openEnquiry.refNo, outcome: "appended" };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const ownerId = await this.nextOwner(tx);
      const row = await tx.enquiry.create({
        data: {
          refNo: await this.sequences.next("enquiry", tx),
          contactName: enquiry.contactName,
          phone: enquiry.phone,
          email: enquiry.email,
          source,
          sourceDetail,
          message: `${this.messageOf(enquiry)}\n\n${summary}`,
          attribution: { ...enquiry.attribution, packageSlug: enquiry.packageSlug, serviceSlug: enquiry.serviceSlug, preferredContact: enquiry.preferredContact, consentAt: enquiry.consent.at } as Prisma.InputJsonValue,
          ownerId,
          assignedAt: ownerId ? new Date() : null,
        },
      });
      await this.audit.record({ action: "enquiry.intake", entityType: "Enquiry", entityId: row.id, after: { source, sourceDetail } }, tx);
      return row;
    });

    await this.notifyOwner(created.ownerId, created.refNo, enquiry.contactName, "new");
    return { kind: "enquiry", id: created.id, refNo: created.refNo, outcome: "created" };
  }

  private eventLink(result: IntakeResult) {
    return result.kind === "lead" ? { leadId: result.id } : { enquiryId: result.id };
  }

  /** What the person actually wrote, plus the details the form collected, as one block of text for the rep to read. */
  private messageOf(enquiry: PublicEnquiry) {
    return [
      enquiry.requirements,
      enquiry.destination && `Destination: ${enquiry.destination}`,
      enquiry.travelMonth && `Travel month: ${enquiry.travelMonth}`,
      enquiry.budget && `Budget: ${enquiry.budget}`,
      enquiry.servicesRequired.length ? `Services: ${enquiry.servicesRequired.join(", ")}` : null,
      enquiry.whatsapp && enquiry.whatsapp !== enquiry.phone ? `WhatsApp: ${enquiry.whatsapp}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** Round-robin across active sales agents when enabled in settings; otherwise leave unassigned. */
  private async nextOwner(tx: Prisma.TransactionClient): Promise<string | null> {
    const assignment = await this.settings.get("leads.assignment", tx);
    if (assignment.mode !== "round_robin") return null;

    const agents = await tx.user.findMany({ where: { role: "SALES_AGENT", status: "ACTIVE" }, orderBy: { id: "asc" }, select: { id: true } });
    if (!agents.length) return null;
    const lastIndex = agents.findIndex((a) => a.id === assignment.lastAssignedUserId);
    const next = agents[(lastIndex + 1) % agents.length]!;
    await this.settings.set("leads.assignment", { ...assignment, lastAssignedUserId: next.id }, undefined, tx);
    return next.id;
  }

  private async notifyOwner(ownerId: string | null, refNo: string, contactName: string, kind: "new" | "repeat") {
    try {
      const recipients = ownerId
        ? await this.prisma.user.findMany({ where: { id: ownerId, status: "ACTIVE" }, select: { email: true } })
        : await this.prisma.user.findMany({ where: { role: { in: ["OPS_MANAGER", "SUPER_ADMIN"] }, status: "ACTIVE" }, select: { email: true } });
      for (const r of recipients) {
        await this.mail.send({
          to: r.email,
          subject: kind === "new" ? `New enquiry ${refNo} — ${contactName}` : `${contactName} enquired again (${refNo})`,
          text: kind === "new" ? `A new website enquiry has arrived${ownerId ? " and is assigned to you" : " and is waiting to be assigned"}.` : "This contact submitted another enquiry. The lead is marked hot for follow-up.",
        });
      }
    } catch (error) {
      this.logger.warn(`Could not notify about lead ${refNo}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private describeSource(enquiry: PublicEnquiry) {
    const form = { GENERAL: "general form", CONTACT: "contact form", PACKAGE: "package page", DESTINATION: "destination page", SERVICE: "service page", CUSTOM_TRIP: "plan-your-trip form" }[enquiry.formType];
    const page = enquiry.packageSlug ?? enquiry.serviceSlug ?? enquiry.attribution.pagePath;
    return `Website ${form}${page ? ` (${page})` : ""}`.slice(0, 160);
  }

  private summarize(enquiry: PublicEnquiry, sourceDetail: string) {
    const travellers = [enquiry.adults && `${enquiry.adults} adult(s)`, enquiry.children && `${enquiry.children} child(ren)`, enquiry.infants && `${enquiry.infants} infant(s)`].filter(Boolean).join(", ");
    return [
      `Trip: ${PRODUCT_TYPE_LABELS[enquiry.productType as ProductType]}${enquiry.destination ? ` · ${enquiry.destination}` : ""}`,
      enquiry.travelFrom ? `Dates: ${enquiry.travelFrom}${enquiry.travelTo ? ` → ${enquiry.travelTo}` : ""}` : enquiry.travelMonth ? `Month: ${enquiry.travelMonth}` : null,
      travellers ? `Travellers: ${travellers}` : null,
      enquiry.attribution.utmSource ? `Campaign: ${enquiry.attribution.utmSource}${enquiry.attribution.utmCampaign ? ` / ${enquiry.attribution.utmCampaign}` : ""}` : null,
      `Prefers: ${enquiry.preferredContact.toLowerCase()} · via ${sourceDetail}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
}
