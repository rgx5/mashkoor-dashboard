import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import type {
  HotelData,
  HotelDetail,
  HotelListQuery,
  HotelRow,
  HotelUpdateData,
  Paginated,
  RatePeriodData,
  RatePeriodRow,
  RatePeriodUpdateData,
  RoomTypeData,
  RoomTypeDetail,
  RoomTypeRow,
  RoomTypeUpdateData,
} from "@mashkoor/shared";
import type { Hotel, Prisma, RatePeriod, RoomType } from "@prisma/client";
import { paginate, toDateOnly } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const hotelInclude = { _count: { select: { roomTypes: true } } } satisfies Prisma.HotelInclude;
type HotelWithRefs = Prisma.HotelGetPayload<{ include: typeof hotelInclude }>;

const toHotelRow = (h: HotelWithRefs): HotelRow => ({
  id: h.id,
  name: h.name,
  city: h.city,
  country: h.country,
  category: h.category,
  address: h.address,
  phone: h.phone,
  notes: h.notes,
  active: h.active,
  roomTypeCount: h._count.roomTypes,
  createdAt: h.createdAt.toISOString(),
});

export const toRoomTypeRow = (rt: RoomType & { _count?: { ratePeriods: number } }): RoomTypeRow => ({
  id: rt.id,
  hotelId: rt.hotelId,
  name: rt.name,
  maxAdults: rt.maxAdults,
  maxChildren: rt.maxChildren,
  mealPlan: rt.mealPlan,
  active: rt.active,
  ratePeriodCount: rt._count?.ratePeriods ?? 0,
});

/** Supplier cost is for managers only; everyone else gets `null` so it can't leak through this API. */
export const redactRateCost = (row: RatePeriodRow, canSeeCost: boolean): RatePeriodRow => (canSeeCost ? row : { ...row, costPrice: null, foreignAmount: null, fxRate: null });

export const toRatePeriodRow = (r: RatePeriod): RatePeriodRow => ({
  id: r.id,
  roomTypeId: r.roomTypeId,
  startDate: toDateOnly(r.startDate)!,
  endDate: toDateOnly(r.endDate)!,
  costPrice: r.costPrice,
  currency: r.currency,
  foreignAmount: r.foreignAmount,
  fxRate: r.fxRate,
  totalRooms: r.totalRooms,
  bookedRooms: r.bookedRooms,
  available: r.totalRooms - r.bookedRooms,
  notes: r.notes,
});

/** M05 · Inventory — hotels, their room types and rate periods (room availability by date range). */
@Injectable()
export class HotelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  // ─── Hotels ───────────────────────────────────────────────────────────────

  async list(actor: RequestUser, query: HotelListQuery): Promise<Paginated<HotelRow>> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.HotelWhereInput = {
      AND: [
        accessibleBy(ability).Hotel,
        query.active !== undefined ? { active: query.active } : {},
        query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { city: { contains: query.q, mode: "insensitive" } }] } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hotel.findMany({ where, include: hotelInclude, orderBy: [{ city: "asc" }, { name: "asc" }], ...paginate(query.page, query.pageSize) }),
      this.prisma.hotel.count({ where }),
    ]);
    return { data: rows.map(toHotelRow), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(actor: RequestUser, id: string): Promise<HotelDetail> {
    await this.findAccessible(actor, id, "read");
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id },
      include: {
        ...hotelInclude,
        roomTypes: { include: { _count: { select: { ratePeriods: true } }, ratePeriods: { orderBy: { startDate: "asc" } } }, orderBy: { name: "asc" } },
      },
    });
    return { ...toHotelRow(hotel), roomTypes: hotel.roomTypes.map((rt) => ({ ...toRoomTypeRow(rt), ratePeriods: rt.ratePeriods.map((rp) => redactRateCost(toRatePeriodRow(rp), this.abilities.forUser(actor).can("manage", "RatePeriod"))) })) };
  }

  async create(actor: RequestUser, input: HotelData): Promise<HotelRow> {
    if (!this.abilities.forUser(actor).can("create", "Hotel")) throw AppError.forbidden();
    const created = await this.prisma.hotel.create({ data: input, include: hotelInclude });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "hotel.created", entityType: "Hotel", entityId: created.id, after: created });
    return toHotelRow(created);
  }

  async update(actor: RequestUser, id: string, input: HotelUpdateData): Promise<HotelRow> {
    const before = await this.findAccessible(actor, id, "update");
    const after = await this.prisma.hotel.update({ where: { id }, data: input, include: hotelInclude });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "hotel.updated", entityType: "Hotel", entityId: id, before, after });
    return toHotelRow(after);
  }

  async remove(actor: RequestUser, id: string) {
    const hotel = await this.findAccessible(actor, id, "delete");
    const roomTypes = await this.prisma.roomType.count({ where: { hotelId: id } });
    if (roomTypes > 0) throw AppError.conflict("Remove this hotel's room types first");
    await this.prisma.hotel.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "hotel.deleted", entityType: "Hotel", entityId: id, before: hotel });
  }

  // ─── Room types ───────────────────────────────────────────────────────────

  async createRoomType(actor: RequestUser, input: RoomTypeData): Promise<RoomTypeRow> {
    if (!this.abilities.forUser(actor).can("create", "RoomType")) throw AppError.forbidden();
    if (!(await this.prisma.hotel.findUnique({ where: { id: input.hotelId } }))) throw AppError.notFound("Hotel");
    const created = await this.prisma.roomType.create({ data: input, include: { _count: { select: { ratePeriods: true } } } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "roomType.created", entityType: "RoomType", entityId: created.id, after: created });
    return toRoomTypeRow(created);
  }

  async updateRoomType(actor: RequestUser, id: string, input: RoomTypeUpdateData): Promise<RoomTypeRow> {
    const before = await this.findRoomTypeAccessible(actor, id, "update");
    const after = await this.prisma.roomType.update({ where: { id }, data: input, include: { _count: { select: { ratePeriods: true } } } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "roomType.updated", entityType: "RoomType", entityId: id, before, after });
    return toRoomTypeRow(after);
  }

  async removeRoomType(actor: RequestUser, id: string) {
    const roomType = await this.findRoomTypeAccessible(actor, id, "delete");
    const periods = await this.prisma.ratePeriod.count({ where: { roomTypeId: id } });
    if (periods > 0) throw AppError.conflict("Remove this room type's rate periods first");
    await this.prisma.roomType.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "roomType.deleted", entityType: "RoomType", entityId: id, before: roomType });
  }

  // ─── Rate periods ─────────────────────────────────────────────────────────

  async createRatePeriod(actor: RequestUser, input: RatePeriodData): Promise<RatePeriodRow> {
    if (!this.abilities.forUser(actor).can("create", "RatePeriod")) throw AppError.forbidden();
    if (!(await this.prisma.roomType.findUnique({ where: { id: input.roomTypeId } }))) throw AppError.notFound("Room type");
    const cost = await this.rateCost(input);
    const created = await this.prisma.ratePeriod.create({
      data: { roomTypeId: input.roomTypeId, startDate: new Date(input.startDate), endDate: new Date(input.endDate), ...cost, totalRooms: input.totalRooms, notes: input.notes },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "ratePeriod.created", entityType: "RatePeriod", entityId: created.id, after: created });
    return redactRateCost(toRatePeriodRow(created), this.abilities.forUser(actor).can("manage", "RatePeriod"));
  }

  async updateRatePeriod(actor: RequestUser, id: string, input: RatePeriodUpdateData): Promise<RatePeriodRow> {
    const before = await this.findRatePeriodAccessible(actor, id, "update");
    if (input.totalRooms !== undefined && input.totalRooms < before.bookedRooms) {
      throw AppError.conflict(`${before.bookedRooms} room(s) are already booked against this period`);
    }
    const touchesCost = input.costPrice !== undefined || input.currency !== undefined || input.foreignAmount !== undefined || input.fxRate !== undefined;
    const cost = touchesCost
      ? await this.rateCost({
          costPrice: input.costPrice ?? before.costPrice,
          currency: input.currency ?? before.currency,
          foreignAmount: input.foreignAmount !== undefined ? input.foreignAmount : before.foreignAmount,
          fxRate: input.fxRate !== undefined ? input.fxRate : before.fxRate,
        })
      : {};
    const after = await this.prisma.ratePeriod.update({
      where: { id },
      data: {
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        ...cost,
        totalRooms: input.totalRooms,
        notes: input.notes,
      },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "ratePeriod.updated", entityType: "RatePeriod", entityId: id, before, after });
    return redactRateCost(toRatePeriodRow(after), this.abilities.forUser(actor).can("manage", "RatePeriod"));
  }

  async removeRatePeriod(actor: RequestUser, id: string) {
    const period = await this.findRatePeriodAccessible(actor, id, "delete");
    if (period.bookedRooms > 0) throw AppError.conflict("Rooms from this period are on a booking — cancel those first");
    await this.prisma.ratePeriod.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "ratePeriod.deleted", entityType: "RatePeriod", entityId: id, before: period });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findAccessible(actor: RequestUser, id: string, action: "read" | "update" | "delete") {
    const hotel: Hotel | null = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw AppError.notFound("Hotel");
    if (!this.abilities.forUser(actor).can(action, subject("Hotel", hotel))) throw AppError.forbidden();
    return hotel;
  }

  private async findRoomTypeAccessible(actor: RequestUser, id: string, action: "update" | "delete") {
    const roomType = await this.prisma.roomType.findUnique({ where: { id } });
    if (!roomType) throw AppError.notFound("Room type");
    if (!this.abilities.forUser(actor).can(action, subject("RoomType", roomType))) throw AppError.forbidden();
    return roomType;
  }

  /**
   * The rupee cost and the currency details to store. A rate quoted in another currency is converted here, from the
   * amount and the rate typed with it, so the rupee figure everything else uses can never disagree with them.
   */
  private async rateCost(input: { costPrice: number; currency?: string; foreignAmount?: number | null; fxRate?: number | null }) {
    const currency = input.currency ?? "INR";
    if (currency === "INR") return { costPrice: input.costPrice, currency: "INR", foreignAmount: null, fxRate: null };
    if (input.foreignAmount == null || !input.fxRate) throw AppError.conflict("Enter the rate in this currency");
    const known = await this.prisma.currency.findUnique({ where: { code: currency }, select: { active: true } });
    if (!known?.active) throw AppError.conflict(`${currency} isn't a currency you've set up`);
    return { costPrice: Math.round(input.foreignAmount * input.fxRate), currency, foreignAmount: input.foreignAmount, fxRate: input.fxRate };
  }

  private async findRatePeriodAccessible(actor: RequestUser, id: string, action: "update" | "delete") {
    const period = await this.prisma.ratePeriod.findUnique({ where: { id } });
    if (!period) throw AppError.notFound("Rate period");
    if (!this.abilities.forUser(actor).can(action, subject("RatePeriod", period))) throw AppError.forbidden();
    return period;
  }
}
