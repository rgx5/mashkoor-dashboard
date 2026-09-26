import type { BookingStatus, LeadStage } from "./constants";

/** Numbers behind the Admin home page. Fields the caller can't see are null (e.g. revenue for sales agents). */
export interface AdminDashboardSummary {
  leads: {
    newToday: number;
    overdueFollowUps: number;
    byStage: Partial<Record<LeadStage, number>>;
    unassigned: number;
  };
  bookings: {
    byStatus: Partial<Record<BookingStatus, number>>;
    awaitingApproval: number;
    /** Sum of sell prices of bookings created this month that are confirmed or completed. */
    revenueThisMonth: number | null;
    marginThisMonth: number | null;
  };
  tasks: { dueToday: number; overdue: number };
  payments: { pendingVerification: number } | null;
  partners: { pendingApplications: number } | null;
  /** Customer money position. Null unless the caller can manage bookings. */
  receivables: { pendingFromCustomers: { amount: number; bookings: number }; advanceFromCustomers: number; collectedThisMonth: number } | null;
  /** Bookings departing within 14 days that still have a balance due. */
  departuresSoon: { id: string; refNo: string; customerName: string; travelFrom: string; balanceDue: number }[];
  lowInventory: { flightsDepartingSoon: { id: string; label: string; available: number; departureAt: string }[] };
}

export interface B2BDashboardSummary {
  openBookings: number;
  bookingsAwaitingApproval: number;
  enquiries: number;
  customers: number;
  balance: number;
  available: number;
}

export interface B2CDashboardSummary {
  upcomingTrip: { id: string; refNo: string; destination: string | null; travelFrom: string | null } | null;
  totalDue: number;
  activeTrips: number;
  openRequests: number;
}
