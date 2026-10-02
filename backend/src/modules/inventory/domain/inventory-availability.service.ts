import { Injectable, Logger } from "@nestjs/common";
import type { InventorySearchQuery, RoomAvailability } from "@mashkoor/shared";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { toFlightSeatBlockRow } from "./flight-inventory.service";
import { toRatePeriodRow } from "./hotels.service";

/**
 * Reserves and releases inventory for bookings. Every change is a single atomic `UPDATE ... WHERE`
 * that only succeeds if enough is still available, so two staff members booking the same rooms or
 * seats at once can never oversell (no row locks needed — Postgres serialises the UPDATE itself).
 */
@Injectable()
export class InventoryAvailabilityService {
  private readonly logger = new Logger("Inventory");

  constructor(private readonly prisma: PrismaService) {}

  async reserveRooms(tx: Prisma.TransactionClient, ratePeriodId: string, quantity: number) {
    const period = await tx.ratePeriod.findUnique({ where: { id: ratePeriodId } });
    if (!period) throw AppError.notFound("Rate period");
    // The WHERE clause re-checks `bookedRooms` at update time, so this is safe under concurrent bookings
    // even though `totalRooms` was read a moment earlier — Postgres locks and re-evaluates per row.
    const { count } = await tx.ratePeriod.updateMany({
      where: { id: ratePeriodId, bookedRooms: { lte: period.totalRooms - quantity } },
      data: { bookedRooms: { increment: quantity } },
    });
    if (count === 0) throw AppError.conflict("Not enough rooms available for these dates");
  }

  /** Releases never take a counter below zero; a mismatch is logged rather than silently corrupting availability. */
  async releaseRooms(tx: Prisma.TransactionClient, ratePeriodId: string, quantity: number) {
    const { count } = await tx.ratePeriod.updateMany({ where: { id: ratePeriodId, bookedRooms: { gte: quantity } }, data: { bookedRooms: { decrement: quantity } } });
    if (count === 0) this.logger.warn(`Release of ${quantity} room(s) on ${ratePeriodId} skipped: fewer than that are marked booked`);
  }

  async reserveSeats(tx: Prisma.TransactionClient, flightSeatBlockId: string, quantity: number) {
    const block = await tx.flightSeatBlock.findUnique({ where: { id: flightSeatBlockId } });
    if (!block) throw AppError.notFound("Flight seat block");
    const { count } = await tx.flightSeatBlock.updateMany({
      where: { id: flightSeatBlockId, bookedSeats: { lte: block.totalSeats - quantity } },
      data: { bookedSeats: { increment: quantity } },
    });
    if (count === 0) throw AppError.conflict("Not enough seats available on this flight");
  }

  async releaseSeats(tx: Prisma.TransactionClient, flightSeatBlockId: string, quantity: number) {
    const { count } = await tx.flightSeatBlock.updateMany({ where: { id: flightSeatBlockId, bookedSeats: { gte: quantity } }, data: { bookedSeats: { decrement: quantity } } });
    if (count === 0) this.logger.warn(`Release of ${quantity} seat(s) on flight block ${flightSeatBlockId} skipped: fewer than that are marked booked`);
  }

  async reserveDeparture(tx: Prisma.TransactionClient, departureId: string, quantity: number) {
    const departure = await tx.packageDeparture.findUnique({ where: { id: departureId } });
    if (!departure) throw AppError.notFound("Departure");
    const { count } = await tx.packageDeparture.updateMany({
      where: { id: departureId, active: true, bookedSeats: { lte: departure.totalSeats - quantity } },
      data: { bookedSeats: { increment: quantity } },
    });
    if (count === 0) throw AppError.conflict("Not enough seats left on this departure");
  }

  async releaseDeparture(tx: Prisma.TransactionClient, departureId: string, quantity: number) {
    const { count } = await tx.packageDeparture.updateMany({ where: { id: departureId, bookedSeats: { gte: quantity } }, data: { bookedSeats: { decrement: quantity } } });
    if (count === 0) this.logger.warn(`Release of ${quantity} seat(s) on departure ${departureId} skipped: fewer than that are marked booked`);
  }

  /** Room types with a rate period open in the requested window, for the booking wizard's search step. */
  async searchRooms(query: InventorySearchQuery): Promise<RoomAvailability[]> {
    const periods = await this.prisma.ratePeriod.findMany({
      where: {
        ...(query.from ? { startDate: { lte: new Date(query.from) } } : {}),
        ...(query.to ? { endDate: { gte: new Date(query.to) } } : {}),
        roomType: {
          active: true,
          // What staff type is matched against the hotel's name as well as its city, so "Voco" and "Makkah" both find it.
          hotel: { active: true, ...(query.city ? { OR: [{ city: { contains: query.city, mode: "insensitive" } }, { name: { contains: query.city, mode: "insensitive" } }] } : {}) },
        },
      },
      include: { roomType: { include: { hotel: true } } },
      orderBy: { startDate: "asc" },
      take: 100,
    });
    return periods
      .filter((p) => p.totalRooms - p.bookedRooms > 0)
      .map((p) => ({
        hotel: { id: p.roomType.hotel.id, name: p.roomType.hotel.name, city: p.roomType.hotel.city, category: p.roomType.hotel.category },
        roomType: { id: p.roomType.id, name: p.roomType.name, mealPlan: p.roomType.mealPlan, maxAdults: p.roomType.maxAdults, maxChildren: p.roomType.maxChildren },
        ratePeriod: toRatePeriodRow(p),
      }));
  }

  async searchFlights(query: InventorySearchQuery) {
    const rows = await this.prisma.flightSeatBlock.findMany({
      where: {
        ...(query.origin ? { origin: query.origin.toUpperCase() } : {}),
        ...(query.destination ? { destination: query.destination.toUpperCase() } : {}),
        ...(query.from ? { departureAt: { gte: new Date(query.from) } } : {}),
      },
      orderBy: { departureAt: "asc" },
      take: 100,
    });
    return rows.map(toFlightSeatBlockRow).filter((f) => f.available > 0);
  }
}
