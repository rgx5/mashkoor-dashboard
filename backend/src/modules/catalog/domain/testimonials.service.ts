import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import type { Paginated, Testimonial, TestimonialData, TestimonialUpdateData } from "@mashkoor/shared";
import type { ListQuery } from "@mashkoor/shared";
import type { Prisma, Testimonial as TestimonialRecord } from "@prisma/client";
import { paginate, toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toDto = (t: TestimonialRecord): Testimonial => ({
  id: t.id,
  customerName: t.customerName,
  location: t.location,
  productType: t.productType,
  rating: t.rating,
  quote: t.quote,
  photoUrl: t.photoUrl,
  published: t.published,
  sortOrder: t.sortOrder,
  createdAt: toIso(t.createdAt)!,
});

/** M04 · Catalog — testimonials shown on the website. */
@Injectable()
export class TestimonialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, query: ListQuery): Promise<Paginated<Testimonial>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.TestimonialWhereInput = { AND: [accessibleBy(ability).Testimonial, query.q ? { customerName: { contains: query.q, mode: "insensitive" } } : {}] };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.testimonial.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], ...paginate(query.page, query.pageSize) }),
      this.prisma.testimonial.count({ where }),
    ]);
    return { data: rows.map(toDto), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async listPublished(): Promise<Testimonial[]> {
    const rows = await this.prisma.testimonial.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
    return rows.map(toDto);
  }

  async create(actor: RequestUser, input: TestimonialData): Promise<Testimonial> {
    if (!this.abilities.forUser(actor).can("create", "Testimonial")) throw AppError.forbidden();
    const created = await this.prisma.testimonial.create({ data: input });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "testimonial.created", entityType: "Testimonial", entityId: created.id, after: created });
    return toDto(created);
  }

  async update(actor: RequestUser, id: string, input: TestimonialUpdateData): Promise<Testimonial> {
    const before = await this.findAccessible(actor, id, "update");
    const after = await this.prisma.testimonial.update({ where: { id }, data: input });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "testimonial.updated", entityType: "Testimonial", entityId: id, before, after });
    return toDto(after);
  }

  async remove(actor: RequestUser, id: string) {
    const testimonial = await this.findAccessible(actor, id, "delete");
    await this.prisma.testimonial.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "testimonial.deleted", entityType: "Testimonial", entityId: id, before: testimonial });
  }

  private async findAccessible(actor: RequestUser, id: string, action: "update" | "delete") {
    const testimonial = await this.prisma.testimonial.findUnique({ where: { id } });
    if (!testimonial) throw AppError.notFound("Testimonial");
    if (!this.abilities.forUser(actor).can(action, subject("Testimonial", testimonial))) throw AppError.forbidden();
    return testimonial;
  }
}
