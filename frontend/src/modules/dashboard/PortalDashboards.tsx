import type { PortalAction } from "@mashkoor/shared";
import { CalendarCheck, CreditCard, FileCheck2, FileText, Luggage, MapPin, MessageSquare, Star, Target, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { useSession } from "@/core/auth/session-store";
import { formatDate, formatINR, timeAgo } from "@/core/format";
import { Badge, Card, PageHeader } from "@/core/ui/layout";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { useB2BDashboard, useCustomerHome } from "./api";

function Tile({ icon: Icon, label, value, to }: { icon: LucideIcon; label: string; value: string | number; to: string }) {
  return (
    <Link to={to}>
      <Card className="flex items-center gap-4 p-4 transition hover:border-plum-200 hover:shadow-sm">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-plum-50 text-plum-600">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-2xl font-bold text-ink-900">{value}</p>
          <p className="text-xs font-semibold text-ink-500">{label}</p>
        </div>
      </Card>
    </Link>
  );
}

const greetingFor = (name?: string) => {
  const hour = new Date().getHours();
  return `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${name?.split(" ")[0] ?? ""}`;
};

export function B2BDashboard() {
  const { user } = useSession("b2b");
  const { data, isLoading, error } = useB2BDashboard();
  if (isLoading) return <FullPageSpinner />;
  if (error || !data) return <p className="py-10 text-center text-sm text-red-600">{errorMessage(error, "Unable to load your dashboard")}</p>;

  return (
    <>
      <PageHeader title={greetingFor(user?.name)} description="Your agency at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile icon={Wallet} label="Wallet balance" value={formatINR(data.balance)} to="/b2b/wallet" />
        <Tile icon={CreditCard} label="Available to spend" value={formatINR(data.available)} to="/b2b/wallet" />
        <Tile icon={Luggage} label="Open bookings" value={data.openBookings} to="/b2b/bookings" />
        <Tile icon={CalendarCheck} label="Awaiting Mashkoor's approval" value={data.bookingsAwaitingApproval} to="/b2b/bookings" />
        <Tile icon={Users} label="Customers" value={data.customers} to="/b2b/customers" />
        <Tile icon={Target} label="Enquiries raised" value={data.enquiries} to="/b2b/enquiries" />
      </div>
    </>
  );
}

const actionIcon: Record<PortalAction["kind"], LucideIcon> = {
  PLAN: FileCheck2,
  PAYMENT: CreditCard,
  TRAVELLERS: Users,
  DOCUMENTS: FileText,
  REVIEW: Star,
  REQUEST: MessageSquare,
};

export function B2CDashboard() {
  const { user } = useSession("b2c");
  const { data, isLoading, error } = useCustomerHome();
  if (isLoading) return <FullPageSpinner />;
  if (error || !data) return <p className="py-10 text-center text-sm text-red-600">{errorMessage(error, "Unable to load your trips")}</p>;

  return (
    <>
      <PageHeader title={greetingFor(user?.name)} description="Your trips with Mashkoor." />
      {data.upcomingTrip ? (
        <Link to={`/b2c/trips/${data.upcomingTrip.id}`}>
          <Card className="mb-4 bg-plum-900 p-6 text-white">
            <p className="text-xs font-semibold tracking-wider text-gold-300 uppercase">Your next trip</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-semibold">
              <MapPin className="h-5 w-5 text-gold-300" aria-hidden /> {data.upcomingTrip.title}
            </p>
            <p className="mt-1 text-sm text-plum-100">
              {data.upcomingTrip.travelFrom ? `Departing ${formatDate(data.upcomingTrip.travelFrom)}` : "Dates to be confirmed"}
              {data.upcomingTrip.daysToGo != null && data.upcomingTrip.daysToGo >= 0 ? ` · ${data.upcomingTrip.daysToGo} day${data.upcomingTrip.daysToGo === 1 ? "" : "s"} to go` : ""}
              {data.upcomingTrip.balanceDue > 0 ? ` · ${formatINR(data.upcomingTrip.balanceDue)} due` : ""}
            </p>
          </Card>
        </Link>
      ) : (
        <Card className="mb-4 p-6 text-sm text-ink-500">No upcoming trips yet. Send us a trip request and we'll take care of the rest.</Card>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Tile icon={Luggage} label="Active trips" value={data.totals.activeTrips} to="/b2c/trips" />
        <Tile icon={CreditCard} label="Amount due" value={formatINR(data.totals.totalDue)} to="/b2c/trips" />
        <Tile icon={Target} label="Open trip requests" value={data.totals.openRequests} to="/b2c/requests" />
      </div>

      {data.actions.length > 0 && (
        <Card className="mb-4 p-5">
          <h2 className="mb-3 text-base font-semibold">Needs your attention</h2>
          <ul className="divide-y divide-line">
            {data.actions.map((a) => {
              const Icon = actionIcon[a.kind];
              return (
                <li key={a.id}>
                  <Link to={a.to} className="flex items-center gap-3 py-2.5 hover:bg-plum-50/40">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.tone === "urgent" ? "bg-red-50 text-red-600" : "bg-plum-50 text-plum-600"}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.title}</span>
                      <span className="block truncate text-xs text-ink-500">{a.detail}</span>
                    </span>
                    {a.tone === "urgent" && <Badge tone="red">Urgent</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {data.recentUpdates.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold">Recent updates</h2>
          <ul className="divide-y divide-line">
            {data.recentUpdates.map((u, i) => (
              <li key={i} className="py-2.5 text-sm">
                <Link to={`/b2c/trips/${u.tripId}`} className="font-semibold text-plum-700 hover:underline">
                  {u.tripRef}
                </Link>
                <span className="ml-1 text-ink-700">{u.message}</span>
                <span className="block text-xs text-ink-500">{timeAgo(u.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
