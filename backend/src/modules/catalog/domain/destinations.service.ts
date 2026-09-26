import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import type { Destination, DestinationData, DestinationListQuery, DestinationUpdateData, Paginated } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { orderByFrom, paginate, toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const include = { _count: { select: { packages: true } } } satisfies Prisma.DestinationInclude;
type DestinationWithRefs = Prisma.DestinationGetPayload<{ include: typeof include }>;

const toDto = (d: DestinationWithRefs): Destination => ({
  id: d.id,
  slug: d.slug,
  name: d.name,
  country: d.country,
  region: d.region,
  summary: d.summary,
  description: d.description,
  heroImageUrl: d.heroImageUrl,
  highlights: d.highlights,
  seoTitle: d.seoTitle,
  seoDescription: d.seoDescription,
  published: d.published,
  sortOrder: d.sortOrder,
  packageCount: d._count.packages,
  createdAt: toIso(d.createdAt)!,
  updatedAt: toIso(d.updatedAt)!,
});

/** M04 · Catalog — destinations. Content editors in Admin; read-only mirror on the public API for the website. */
@Injectable()
export class DestinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, query: DestinationListQuery): Promise<Paginated<Destination>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.DestinationWhereInput = {
      AND: [
        accessibleBy(ability).Destination,
        query.published !== undefined ? { published: query.published } : {},
        query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { country: { contains: query.q, mode: "insensitive" } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.destination.findMany({ where, include, orderBy: orderByFrom(query.sort, ["name", "sortOrder", "createdAt"] as const, { sortOrder: "asc" }), ...paginate(query.page, query.pageSize) }),
      this.prisma.destination.count({ where }),
    ]);
    return { data: rows.map(toDto), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Published destinations for the website, in display order. */
  async listPublished(): Promise<Destination[]> {
    const rows = await this.prisma.destination.findMany({ where: { published: true }, include, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return rows.map(toDto);
  }

  async get(actor: RequestUser, id: string): Promise<Destination> {
    await this.findAccessible(actor, id, "read");
    return toDto(await this.prisma.destination.findUniqueOrThrow({ where: { id }, include }));
  }

  async getBySlug(slug: string): Promise<Destination | null> {
    const destination = await this.prisma.destination.findUnique({ where: { slug }, include });
    return destination && destination.published ? toDto(destination) : null;
  }

  async create(actor: RequestUser, input: DestinationData): Promise<Destination> {
    if (!this.abilities.forUser(actor).can("create", "Destination")) throw AppError.forbidden();
    await this.assertSlugFree(input.slug);
    const created = await this.prisma.destination.create({ data: { ...input, createdById: actor.id }, include });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "destination.created", entityType: "Destination", entityId: created.id, after: created });
    return toDto(created);
  }

  async update(actor: RequestUser, id: string, input: DestinationUpdateData): Promise<Destination> {
    const before = await this.findAccessible(actor, id, "update");
    if (input.slug && input.slug !== before.slug) await this.assertSlugFree(input.slug);
    const after = await this.prisma.destination.update({ where: { id }, data: input, include });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "destination.updated", entityType: "Destination", entityId: id, before, after });
    return toDto(after);
  }

  async remove(actor: RequestUser, id: string) {
    const destination = await this.findAccessible(actor, id, "delete");
    const packages = await this.prisma.package.count({ where: { destinationId: id } });
    if (packages > 0) throw AppError.conflict("Move or delete this destination's packages first");
    await this.prisma.destination.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "destination.deleted", entityType: "Destination", entityId: id, before: destination });
  }

  private async findAccessible(actor: RequestUser, id: string, action: "read" | "update" | "delete") {
    const destination = await this.prisma.destination.findUnique({ where: { id } });
    if (!destination) throw AppError.notFound("Destination");
    if (!this.abilities.forUser(actor).can(action, subject("Destination", destination))) throw AppError.forbidden();
    return destination;
  }

  private async assertSlugFree(slug: string) {
    if (await this.prisma.destination.findUnique({ where: { slug } })) throw AppError.conflict("That slug is already used by another destination");
  }
}
