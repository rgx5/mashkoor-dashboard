import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import type { InboundEventListQuery, InboundEventRow, Paginated } from "@mashkoor/shared";
import type { InboundEvent, Prisma } from "@prisma/client";
import { paginate, toIso } from "../../../common/serialize";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { LeadIntakeService } from "./lead-intake.service";

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** M13 · Everything that arrived from outside (website forms, payment gateway, later WhatsApp/Meta), and a way to replay failures. */
@Injectable()
export class InboundEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly intake: LeadIntakeService,
  ) {}

  private summarize(e: InboundEvent): string {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.channel === "WEBSITE") return [text(p.contactName), text(p.phone), text(p.formType).toLowerCase().replace(/_/g, " ")].filter(Boolean).join(" · ") || "Website enquiry";
    if (e.channel === "PAYMENT_GATEWAY") return [text(p.type), p.amount != null ? `₹${Number(p.amount).toLocaleString("en-IN")}` : "", text(p.orderId)].filter(Boolean).join(" · ") || "Gateway event";
    return e.channel.replace(/_/g, " ").toLowerCase();
  }

  private toRow(e: InboundEvent): InboundEventRow {
    return { id: e.id, channel: e.channel, status: e.status, summary: this.summarize(e), error: e.error, leadId: e.leadId, createdAt: toIso(e.createdAt)!, processedAt: toIso(e.processedAt) };
  }

  async list(actor: RequestUser, query: InboundEventListQuery): Promise<Paginated<InboundEventRow>> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", "InboundEvent")) throw AppError.forbidden();
    const where: Prisma.InboundEventWhereInput = {
      AND: [accessibleBy(ability).InboundEvent, query.channel ? { channel: query.channel } : {}, query.status ? { status: query.status } : {}],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inboundEvent.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(query.page, query.pageSize) }),
      this.prisma.inboundEvent.count({ where }),
    ]);
    return { data: rows.map((e) => this.toRow(e)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Runs a failed (or stuck) website enquiry through intake again. Safe to repeat: a processed event is refused. */
  async replay(actor: RequestUser, id: string): Promise<InboundEventRow> {
    if (!this.abilities.forUser(actor).can("update", "InboundEvent")) throw AppError.forbidden();
    const event = await this.prisma.inboundEvent.findUnique({ where: { id } });
    if (!event) throw AppError.notFound("Event");
    if (event.channel !== "WEBSITE") throw AppError.conflict("Only website enquiries can be replayed");
    if (event.status === "PROCESSED") throw AppError.conflict("This enquiry was already turned into a lead");
    await this.intake.replayWebsiteEvent(event);
    return this.toRow(await this.prisma.inboundEvent.findUniqueOrThrow({ where: { id } }));
  }
}
