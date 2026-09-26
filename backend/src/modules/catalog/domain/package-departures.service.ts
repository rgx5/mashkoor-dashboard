import { Injectable } from "@nestjs/common";
import type { PackageDepartureData, PackageDepartureRow, PackageDepartureUpdateData } from "@mashkoor/shared";
import type { PackageDeparture } from "@prisma/client";
import { fromDateOnly, toDateOnly, toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toRow = (d: PackageDeparture): PackageDepartureRow => ({
  id: d.id,
  packageId: d.packageId,
  departureDate: toDateOnly(d.departureDate)!,
  returnDate: toDateOnly(d.returnDate),
  pricePerHead: d.pricePerHead,
  depositPerHead: d.depositPerHead,
  totalSeats: d.totalSeats,
  bookedSeats: d.bookedSeats,
  seatsLeft: Math.max(0, d.totalSeats - d.bookedSeats),
  active: d.active,
  createdAt: toIso(d.createdAt)!,
});

/** Fixed-date, fixed-capacity departures a staff member sets up under a package so the website can sell it directly. */
@Injectable()
export class PackageDeparturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, packageId: string): Promise<PackageDepartureRow[]> {
    if (!this.abilities.forUser(actor).can("read", "Package")) throw AppError.forbidden();
    const rows = await this.prisma.packageDeparture.findMany({ where: { packageId }, orderBy: { departureDate: "asc" } });
    return rows.map(toRow);
  }

  async create(actor: RequestUser, packageId: string, input: PackageDepartureData): Promise<PackageDepartureRow> {
    if (!this.abilities.forUser(actor).can("update", "Package")) throw AppError.forbidden();
    if (!(await this.prisma.package.findUnique({ where: { id: packageId } }))) throw AppError.notFound("Package");

    const created = await this.prisma.packageDeparture.create({
      data: { packageId, departureDate: fromDateOnly(input.departureDate)!, returnDate: fromDateOnly(input.returnDate), pricePerHead: input.pricePerHead, depositPerHead: input.depositPerHead ?? null, totalSeats: input.totalSeats, active: input.active },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "packageDeparture.created", entityType: "PackageDeparture", entityId: created.id, after: created });
    return toRow(created);
  }

  async update(actor: RequestUser, id: string, input: PackageDepartureUpdateData): Promise<PackageDepartureRow> {
    const before = await this.findAccessible(actor, id);
    if (input.totalSeats !== undefined && input.totalSeats < before.bookedSeats) throw AppError.conflict(`Can't set total seats below the ${before.bookedSeats} already booked`);

    const updated = await this.prisma.packageDeparture.update({
      where: { id },
      data: { ...(input.departureDate ? { departureDate: fromDateOnly(input.departureDate)! } : {}), ...(input.returnDate !== undefined ? { returnDate: fromDateOnly(input.returnDate) } : {}), pricePerHead: input.pricePerHead, depositPerHead: input.depositPerHead, totalSeats: input.totalSeats, active: input.active },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "packageDeparture.updated", entityType: "PackageDeparture", entityId: id, before, after: updated });
    return toRow(updated);
  }

  async remove(actor: RequestUser, id: string) {
    const departure = await this.findAccessible(actor, id);
    if (departure.bookedSeats > 0) throw AppError.conflict("This departure has bookings against it — mark it inactive instead of deleting it");
    await this.prisma.packageDeparture.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "packageDeparture.deleted", entityType: "PackageDeparture", entityId: id, before: departure });
  }

  private async findAccessible(actor: RequestUser, id: string) {
    if (!this.abilities.forUser(actor).can("update", "Package")) throw AppError.forbidden();
    const departure = await this.prisma.packageDeparture.findUnique({ where: { id } });
    if (!departure) throw AppError.notFound("Departure");
    return departure;
  }
}
