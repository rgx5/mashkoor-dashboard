import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import type { Faq, FaqData, FaqUpdateData } from "@mashkoor/shared";
import type { Faq as FaqRecord, Prisma } from "@prisma/client";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toDto = (f: FaqRecord): Faq => ({ id: f.id, category: f.category, question: f.question, answer: f.answer, published: f.published, sortOrder: f.sortOrder });

/** M04 · Catalog — FAQs. Small enough to list in full rather than paginate. */
@Injectable()
export class FaqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser): Promise<Faq[]> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.FaqWhereInput = accessibleBy(ability).Faq;
    const rows = await this.prisma.faq.findMany({ where, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
    return rows.map(toDto);
  }

  async listPublished(): Promise<Faq[]> {
    const rows = await this.prisma.faq.findMany({ where: { published: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
    return rows.map(toDto);
  }

  async create(actor: RequestUser, input: FaqData): Promise<Faq> {
    if (!this.abilities.forUser(actor).can("create", "Faq")) throw AppError.forbidden();
    const created = await this.prisma.faq.create({ data: input });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "faq.created", entityType: "Faq", entityId: created.id, after: created });
    return toDto(created);
  }

  async update(actor: RequestUser, id: string, input: FaqUpdateData): Promise<Faq> {
    const before = await this.findAccessible(actor, id, "update");
    const after = await this.prisma.faq.update({ where: { id }, data: input });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "faq.updated", entityType: "Faq", entityId: id, before, after });
    return toDto(after);
  }

  async remove(actor: RequestUser, id: string) {
    const faq = await this.findAccessible(actor, id, "delete");
    await this.prisma.faq.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "faq.deleted", entityType: "Faq", entityId: id, before: faq });
  }

  private async findAccessible(actor: RequestUser, id: string, action: "update" | "delete") {
    const faq = await this.prisma.faq.findUnique({ where: { id } });
    if (!faq) throw AppError.notFound("FAQ");
    if (!this.abilities.forUser(actor).can(action, subject("Faq", faq))) throw AppError.forbidden();
    return faq;
  }
}
