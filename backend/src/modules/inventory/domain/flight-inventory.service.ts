import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import type { FlightSeatBlockData, FlightSeatBlockListQuery, FlightSeatBlockRow, FlightSeatBlockUpdateData, Paginated } from "@mashkoor/shared";
import type { FlightSeatBlock, Prisma } from "@prisma/client";
import { paginate } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

export const toFlightSeatBlockRow = (f: FlightSeatBlock): FlightSeatBlockRow => ({
  id: f.id,
  airline: f.airline,
  flightNumber: f.flightNumber,
  origin: f.origin,
  destination: f.destination,
  departureAt: f.departureAt.toISOString(),
  arrivalAt: f.arrivalAt ? f.arrivalAt.toISOString() : null,
  cabinClass: f.cabinClass,
  totalSeats: f.totalSeats,
  bookedSeats: f.bookedSeats,
  available: f.totalSeats - f.bookedSeats,
  costPrice: f.costPrice,
  notes: f.notes,
});

/** Supplier cost is for managers only; everyone else gets `null` so it can't leak through this API. */
export const redactFlightCost = (row: FlightSeatBlockRow, canSeeCost: boolean): FlightSeatBlockRow => (canSeeCost ? row : { ...row, costPrice: null });

/** M05 · Inventory — flight seat blocks (seats Mashkoor bought in bulk and resells). */
@Injectable()
export class FlightInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, query: FlightSeatBlockListQuery): Promise<Paginated<FlightSeatBlockRow>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.FlightSeatBlockWhereInput = {
      AND: [
        accessibleBy(ability).FlightSeatBlock,
        query.origin ? { origin: query.origin.toUpperCase() } : {},
        query.destination ? { destination: query.destination.toUpperCase() } : {},
        query.from ? { departureAt: { gte: new Date(query.from) } } : {},
        query.q ? { OR: [{ flightNumber: { contains: query.q, mode: "insensitive" } }, { airline: { contains: query.q, mode: "insensitive" } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.flightSeatBlock.findMany({ where, orderBy: { departureAt: "asc" }, ...paginate(query.page, query.pageSize) }),
      this.prisma.flightSeatBlock.count({ where }),
    ]);
    const showCost = ability.can("manage", "FlightSeatBlock");
    return { data: rows.map((r) => redactFlightCost(toFlightSeatBlockRow(r), showCost)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async create(actor: RequestUser, input: FlightSeatBlockData): Promise<FlightSeatBlockRow> {
    if (!this.abilities.forUser(actor).can("create", "FlightSeatBlock")) throw AppError.forbidden();
    const created = await this.prisma.flightSeatBlock.create({ data: { ...input, arrivalAt: input.arrivalAt ?? null } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "flightSeatBlock.created", entityType: "FlightSeatBlock", entityId: created.id, after: created });
    return redactFlightCost(toFlightSeatBlockRow(created), this.abilities.forUser(actor).can("manage", "FlightSeatBlock"));
  }

  async update(actor: RequestUser, id: string, input: FlightSeatBlockUpdateData): Promise<FlightSeatBlockRow> {
    const before = await this.findAccessible(actor, id, "update");
    if (input.totalSeats !== undefined && input.totalSeats < before.bookedSeats) {
      throw AppError.conflict(`${before.bookedSeats} seat(s) are already booked against this flight`);
    }
    const after = await this.prisma.flightSeatBlock.update({ where: { id }, data: input });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "flightSeatBlock.updated", entityType: "FlightSeatBlock", entityId: id, before, after });
    return redactFlightCost(toFlightSeatBlockRow(after), this.abilities.forUser(actor).can("manage", "FlightSeatBlock"));
  }

  async remove(actor: RequestUser, id: string) {
    const block = await this.findAccessible(actor, id, "delete");
    if (block.bookedSeats > 0) throw AppError.conflict("Seats from this flight are on a booking — cancel those first");
    await this.prisma.flightSeatBlock.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "flightSeatBlock.deleted", entityType: "FlightSeatBlock", entityId: id, before: block });
  }

  private async findAccessible(actor: RequestUser, id: string, action: "update" | "delete") {
    const block = await this.prisma.flightSeatBlock.findUnique({ where: { id } });
    if (!block) throw AppError.notFound("Flight seat block");
    if (!this.abilities.forUser(actor).can(action, subject("FlightSeatBlock", block))) throw AppError.forbidden();
    return block;
  }
}
