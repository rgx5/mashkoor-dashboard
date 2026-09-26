import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import type { PackageData, PackageDetail, PackageListQuery, PackageRow, PackageUpdateData, Paginated } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { orderByFrom, paginate, toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { SequenceService } from "../../../core/numbering/sequence.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const include = { destination: { select: { id: true, name: true } } } satisfies Prisma.PackageInclude;
type PackageWithRefs = Prisma.PackageGetPayload<{ include: typeof include }>;

/** Lowest adult price across the package's tiers, for the register/browse list. */
const fromPrice = (p: PackageWithRefs): number | null => {
  const tiers = (p.priceTiers as { adultPrice: number }[] | null) ?? [];
  return tiers.length ? Math.min(...tiers.map((t) => t.adultPrice)) : null;
};

const toRow = (p: PackageWithRefs): PackageRow => ({
  id: p.id,
  refCode: p.refCode,
  slug: p.slug,
  title: p.title,
  productType: p.productType,
  destination: p.destination,
  nights: p.nights,
  days: p.days,
  heroImageUrl: p.heroImageUrl,
  fromPrice: fromPrice(p),
  published: p.published,
  featured: p.featured,
  sortOrder: p.sortOrder,
  createdAt: toIso(p.createdAt)!,
});

const toDetail = (p: PackageWithRefs): PackageDetail => ({
  ...toRow(p),
  summary: p.summary,
  description: p.description,
  galleryUrls: p.galleryUrls,
  highlights: p.highlights,
  inclusions: p.inclusions,
  exclusions: p.exclusions,
  itinerary: (p.itinerary as PackageDetail["itinerary"]) ?? [],
  hotels: (p.hotels as PackageDetail["hotels"]) ?? [],
  priceTiers: (p.priceTiers as PackageDetail["priceTiers"]) ?? [],
  seoTitle: p.seoTitle,
  seoDescription: p.seoDescription,
  updatedAt: toIso(p.updatedAt)!,
});

/** M04 · Catalog — packages (day plan, hotels shown for marketing, price tiers, SEO). */
@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, query: PackageListQuery): Promise<Paginated<PackageRow>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.PackageWhereInput = {
      AND: [
        accessibleBy(ability).Package,
        query.productType ? { productType: query.productType } : {},
        query.destinationId ? { destinationId: query.destinationId } : {},
        query.published !== undefined ? { published: query.published } : {},
        query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { refCode: { contains: query.q, mode: "insensitive" } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.package.findMany({
        where,
        include,
        orderBy: orderByFrom(query.sort, ["title", "sortOrder", "createdAt"] as const, { sortOrder: "asc" }),
        ...paginate(query.page, query.pageSize),
      }),
      this.prisma.package.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async listPublished(filters: { productType?: string; destinationId?: string; featured?: boolean } = {}): Promise<PackageRow[]> {
    const rows = await this.prisma.package.findMany({
      where: {
        published: true,
        productType: filters.productType as never,
        destinationId: filters.destinationId,
        featured: filters.featured,
      },
      include,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    return rows.map(toRow);
  }

  async get(actor: RequestUser, id: string): Promise<PackageDetail> {
    await this.findAccessible(actor, id, "read");
    return toDetail(await this.prisma.package.findUniqueOrThrow({ where: { id }, include }));
  }

  async getBySlug(slug: string): Promise<PackageDetail | null> {
    const pkg = await this.prisma.package.findUnique({ where: { slug }, include });
    return pkg && pkg.published ? toDetail(pkg) : null;
  }

  async create(actor: RequestUser, input: PackageData): Promise<PackageDetail> {
    if (!this.abilities.forUser(actor).can("create", "Package")) throw AppError.forbidden();
    await this.assertSlugFree(input.slug);
    if (input.destinationId && !(await this.prisma.destination.findUnique({ where: { id: input.destinationId } }))) throw AppError.notFound("Destination");

    const created = await this.prisma.$transaction(async (tx) => {
      const pkg = await tx.package.create({ data: { ...input, refCode: await this.sequences.next("package", tx), createdById: actor.id }, include });
      await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "package.created", entityType: "Package", entityId: pkg.id, after: pkg }, tx);
      return pkg;
    });
    return toDetail(created);
  }

  async update(actor: RequestUser, id: string, input: PackageUpdateData): Promise<PackageDetail> {
    const before = await this.findAccessible(actor, id, "update");
    if (input.slug && input.slug !== before.slug) await this.assertSlugFree(input.slug);
    if (input.destinationId && !(await this.prisma.destination.findUnique({ where: { id: input.destinationId } }))) throw AppError.notFound("Destination");

    const after = await this.prisma.package.update({ where: { id }, data: input, include });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "package.updated", entityType: "Package", entityId: id, before, after });
    return toDetail(after);
  }

  async remove(actor: RequestUser, id: string) {
    const pkg = await this.findAccessible(actor, id, "delete");
    const used = await this.prisma.bookingItem.count({ where: { packageId: id } });
    if (used > 0) throw AppError.conflict("This package is used on a booking and can't be deleted — unpublish it instead");
    await this.prisma.package.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "package.deleted", entityType: "Package", entityId: id, before: pkg });
  }

  /** Used by BookingsService to attach an accessible, real package to a booking item. */
  async assertBookable(id: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg) throw AppError.notFound("Package");
    return pkg;
  }

  private async findAccessible(actor: RequestUser, id: string, action: "read" | "update" | "delete") {
    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg) throw AppError.notFound("Package");
    if (!this.abilities.forUser(actor).can(action, subject("Package", pkg))) throw AppError.forbidden();
    return pkg;
  }

  private async assertSlugFree(slug: string) {
    if (await this.prisma.package.findUnique({ where: { slug } })) throw AppError.conflict("That slug is already used by another package");
  }
}
