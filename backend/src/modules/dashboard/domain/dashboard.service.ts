import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import { OPEN_LEAD_STAGES, type AdminDashboardSummary, type B2BDashboardSummary, type B2CDashboardSummary, type BookingStatus, type LeadStage } from "@mashkoor/shared";
import { toDateOnly } from "../../../common/serialize";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

/** M14 · Dashboards — read-only aggregates per portal. Every query is scoped with the caller's own abilities or token IDs. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
  ) {}

  async admin(actor: RequestUser): Promise<AdminDashboardSummary> {
    const ability = this.abilities.forUser(actor);
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const soon = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

    const leadScope = accessibleBy(ability).Lead;
    const bookingScope = accessibleBy(ability).Booking;
    const canManageBookings = ability.can("manage", "Booking");
    const canManagePartners = ability.can("manage", "Partner");

    const [leadStages, newToday, overdue, unassigned, bookingStatuses, revenue, tasksToday, tasksOverdue, pendingPayments, pendingPartners, flights] = await Promise.all([
      this.prisma.lead.groupBy({ by: ["stage"], where: leadScope, _count: true }),
      this.prisma.lead.count({ where: { AND: [leadScope, { createdAt: { gte: startOfDay } }] } }),
      this.prisma.lead.count({ where: { AND: [leadScope, { nextFollowUpAt: { lt: now }, stage: { in: [...OPEN_LEAD_STAGES] } }] } }),
      this.prisma.lead.count({ where: { AND: [leadScope, { ownerId: null, stage: { in: [...OPEN_LEAD_STAGES] } }] } }),
      this.prisma.booking.groupBy({ by: ["status"], where: bookingScope, _count: true }),
      this.prisma.booking.aggregate({
        where: { AND: [bookingScope, { status: { in: ["CONFIRMED", "COMPLETED"] }, createdAt: { gte: startOfMonth } }] },
        _sum: { totalSell: true, totalCost: true },
      }),
      this.prisma.task.count({ where: { assigneeId: actor.id, status: "OPEN", dueAt: { gte: startOfDay, lte: endOfDay } } }),
      this.prisma.task.count({ where: { assigneeId: actor.id, status: "OPEN", dueAt: { lt: startOfDay } } }),
      canManageBookings ? this.prisma.payment.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
      canManagePartners ? this.prisma.partner.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
      ability.can("read", "FlightSeatBlock")
        ? this.prisma.flightSeatBlock.findMany({ where: { departureAt: { gte: now, lte: soon } }, orderBy: { departureAt: "asc" }, take: 50 })
        : Promise.resolve([]),
    ]);

    // Customer money position, from verified payments only (pending ones aren't money yet).
    const moneyBookings = await this.prisma.booking.findMany({
      where: { AND: [bookingScope, { status: { in: ["QUOTE", "PENDING_PAYMENT", "PENDING_APPROVAL", "IN_PROGRESS", "CONFIRMED", "COMPLETED"] } }] },
      select: {
        id: true,
        refNo: true,
        status: true,
        totalSell: true,
        travelFrom: true,
        customer: { select: { fullName: true } },
        payments: { where: { status: "VERIFIED" }, select: { amount: true, direction: true, verifiedAt: true } },
      },
      take: 5000,
    });
    const netOf = (b: (typeof moneyBookings)[number]) => b.payments.reduce((sum, p) => sum + (p.direction === "COLLECTION" ? p.amount : -p.amount), 0);
    const owing = moneyBookings.filter((b) => ["PENDING_PAYMENT", "IN_PROGRESS", "CONFIRMED", "COMPLETED"].includes(b.status) && b.totalSell - netOf(b) > 0);
    const notYetConfirmed = moneyBookings.filter((b) => ["QUOTE", "PENDING_PAYMENT", "PENDING_APPROVAL"].includes(b.status));
    const departuresSoon = moneyBookings
      .filter((b) => b.travelFrom && b.travelFrom >= startOfDay && b.travelFrom <= soon && ["IN_PROGRESS", "CONFIRMED", "PENDING_PAYMENT"].includes(b.status) && b.totalSell - netOf(b) > 0)
      .sort((a, b) => a.travelFrom!.getTime() - b.travelFrom!.getTime())
      .slice(0, 10)
      .map((b) => ({ id: b.id, refNo: b.refNo, customerName: b.customer.fullName, travelFrom: toDateOnly(b.travelFrom)!, balanceDue: b.totalSell - netOf(b) }));
    const receivables = canManageBookings
      ? {
          pendingFromCustomers: { amount: owing.reduce((sum, b) => sum + (b.totalSell - netOf(b)), 0), bookings: owing.length },
          advanceFromCustomers: notYetConfirmed.reduce((sum, b) => sum + Math.max(0, netOf(b)), 0),
          collectedThisMonth: moneyBookings.reduce(
            (sum, b) => sum + b.payments.filter((p) => p.verifiedAt && p.verifiedAt >= startOfMonth).reduce((s, p) => s + (p.direction === "COLLECTION" ? p.amount : -p.amount), 0),
            0,
          ),
        }
      : null;

    const byStatus: Partial<Record<BookingStatus, number>> = {};
    for (const row of bookingStatuses) byStatus[row.status] = row._count;
    const byStage: Partial<Record<LeadStage, number>> = {};
    for (const row of leadStages) byStage[row.stage] = row._count;

    return {
      leads: { newToday, overdueFollowUps: overdue, byStage, unassigned },
      bookings: {
        byStatus,
        awaitingApproval: byStatus.PENDING_APPROVAL ?? 0,
        revenueThisMonth: canManageBookings ? (revenue._sum.totalSell ?? 0) : null,
        marginThisMonth: canManageBookings ? (revenue._sum.totalSell ?? 0) - (revenue._sum.totalCost ?? 0) : null,
      },
      tasks: { dueToday: tasksToday, overdue: tasksOverdue },
      payments: canManageBookings ? { pendingVerification: pendingPayments } : null,
      partners: canManagePartners ? { pendingApplications: pendingPartners } : null,
      receivables,
      departuresSoon,
      lowInventory: {
        flightsDepartingSoon: flights
          .filter((f) => f.totalSeats - f.bookedSeats <= 3)
          .map((f) => ({ id: f.id, label: `${f.airline} ${f.flightNumber} · ${f.origin} → ${f.destination}`, available: f.totalSeats - f.bookedSeats, departureAt: f.departureAt.toISOString() })),
      },
    };
  }

  async b2b(actor: RequestUser): Promise<B2BDashboardSummary> {
    if (!actor.partnerId) throw AppError.forbidden();
    const partnerId = actor.partnerId;
    const [openBookings, awaiting, enquiries, customers, wallet] = await Promise.all([
      this.prisma.booking.count({ where: { partnerId, status: { in: ["PENDING_APPROVAL", "IN_PROGRESS", "CONFIRMED"] } } }),
      this.prisma.booking.count({ where: { partnerId, status: "PENDING_APPROVAL" } }),
      this.prisma.lead.count({ where: { partnerId } }),
      this.prisma.customer.count({ where: { partnerId, deletedAt: null } }),
      this.prisma.walletAccount.findUnique({ where: { partnerId } }),
    ]);
    const balance = wallet?.balance ?? 0;
    return { openBookings, bookingsAwaitingApproval: awaiting, enquiries, customers, balance, available: balance + (wallet?.creditLimit ?? 0) };
  }

  async b2c(actor: RequestUser): Promise<B2CDashboardSummary> {
    if (!actor.customerId) throw AppError.forbidden();
    const customerId = actor.customerId;
    const active = { customerId, status: { in: ["QUOTE", "PENDING_PAYMENT", "IN_PROGRESS", "CONFIRMED"] as BookingStatus[] } };
    const [upcoming, activeTrips, openRequests, bookings] = await Promise.all([
      this.prisma.booking.findFirst({ where: { ...active, travelFrom: { gte: new Date() } }, orderBy: { travelFrom: "asc" } }),
      this.prisma.booking.count({ where: active }),
      this.prisma.lead.count({ where: { customerId, stage: { in: [...OPEN_LEAD_STAGES] } } }),
      this.prisma.booking.findMany({ where: { customerId, status: { in: ["PENDING_PAYMENT", "IN_PROGRESS", "CONFIRMED"] } }, include: { payments: true } }),
    ]);
    const totalDue = bookings.reduce((sum, b) => {
      const collected = b.payments.filter((p) => p.status === "VERIFIED" && p.direction === "COLLECTION").reduce((s, p) => s + p.amount, 0);
      const refunded = b.payments.filter((p) => p.status === "VERIFIED" && p.direction === "REFUND").reduce((s, p) => s + p.amount, 0);
      return sum + Math.max(0, b.totalSell - collected + refunded);
    }, 0);
    return {
      upcomingTrip: upcoming ? { id: upcoming.id, refNo: upcoming.refNo, destination: upcoming.destination, travelFrom: toDateOnly(upcoming.travelFrom) } : null,
      totalDue,
      activeTrips,
      openRequests,
    };
  }
}
