import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import type { Activity as ActivityDto, ActivityEntityType, ActivityInput, ActivityType } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";
import { toIso, userRef, userRefSelect } from "../../../common/serialize";

const CONTACT_TYPES = new Set<ActivityType>(["CALL", "WHATSAPP", "EMAIL", "MEETING"]);

const include = {
  createdBy: userRefSelect,
  lead: { select: { id: true, refNo: true } },
} satisfies Prisma.ActivityInclude;

type ActivityWithRefs = Prisma.ActivityGetPayload<{ include: typeof include }>;

export const toActivityDto = (a: ActivityWithRefs): ActivityDto => ({
  id: a.id,
  entityType: a.entityType,
  entityId: a.entityId,
  type: a.type,
  body: a.body,
  meta: (a.meta as Record<string, unknown> | null) ?? null,
  createdBy: userRef(a.createdBy),
  createdAt: toIso(a.createdAt)!,
  lead: a.lead,
});

export interface SystemActivity {
  entityType: ActivityEntityType;
  entityId: string;
  type: ActivityType;
  body: string;
  meta?: Prisma.InputJsonValue;
  customerId?: string | null;
  leadId?: string | null;
  actorId?: string | null;
}

/** M03 · Activity timeline. Other modules write system entries through `record()`. */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
  ) {}

  record(entry: SystemActivity, tx: Prisma.TransactionClient = this.prisma) {
    return tx.activity.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        type: entry.type,
        body: entry.body,
        meta: entry.meta,
        customerId: entry.customerId ?? null,
        leadId: entry.leadId ?? (entry.entityType === "LEAD" ? entry.entityId : null),
        createdById: entry.actorId ?? null,
      },
    });
  }

  /** A person logs a note, call, WhatsApp chat, email or meeting. */
  async logManual(actor: RequestUser, input: ActivityInput): Promise<ActivityDto> {
    const ability = this.abilities.forUser(actor);

    if (input.entityType === "LEAD") {
      const lead = await this.prisma.lead.findUnique({ where: { id: input.entityId } });
      if (!lead) throw AppError.notFound("Lead");
      if (!ability.can("update", subject("Lead", lead))) throw AppError.forbidden();

      const activity = await this.prisma.$transaction(async (tx) => {
        const created = await this.record({ ...input, customerId: lead.customerId, actorId: actor.id }, tx);
        if (CONTACT_TYPES.has(input.type)) {
          await tx.lead.update({ where: { id: lead.id }, data: { lastContactedAt: new Date() } });
        }
        return created;
      });
      return this.getDto(activity.id);
    }

    const customer = await this.prisma.customer.findFirst({ where: { id: input.entityId, deletedAt: null } });
    if (!customer) throw AppError.notFound("Customer");
    if (!ability.can("read", subject("Customer", customer))) throw AppError.forbidden();
    const created = await this.record({ ...input, customerId: customer.id, actorId: actor.id });
    return this.getDto(created.id);
  }

  async listForEntity(actor: RequestUser, entityType: ActivityEntityType, entityId: string, limit: number): Promise<ActivityDto[]> {
    const ability = this.abilities.forUser(actor);

    if (entityType === "LEAD") {
      const lead = await this.prisma.lead.findUnique({ where: { id: entityId } });
      if (!lead) throw AppError.notFound("Lead");
      if (!ability.can("read", subject("Lead", lead))) throw AppError.forbidden();
      const rows = await this.prisma.activity.findMany({ where: { leadId: entityId }, include, orderBy: { createdAt: "desc" }, take: limit });
      return rows.map(toActivityDto);
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: entityId } });
    if (!customer) throw AppError.notFound("Customer");
    if (!ability.can("read", subject("Customer", customer))) throw AppError.forbidden();
    // Customer 360: everything linked to the customer, including activity on their leads.
    const rows = await this.prisma.activity.findMany({ where: { customerId: entityId }, include, orderBy: { createdAt: "desc" }, take: limit });
    return rows.map(toActivityDto);
  }

  private async getDto(id: string) {
    return toActivityDto(await this.prisma.activity.findUniqueOrThrow({ where: { id }, include }));
  }
}
