import { BOOKING_STATUS_LABELS, BOOKING_STATUSES, LEAD_STAGE_LABELS, LEAD_STAGES, REPORT_INFO, ROLE_LABELS, type BookingStatus, type LeadStage, type ReportName } from "@mashkoor/shared";
import {
  Banknote,
  BadgeCheck,
  BookOpen,
  Building,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Filter,
  Globe,
  MapPin,
  Package,
  ShieldAlert,
  Star,
  Hourglass,
  ListTodo,
  Luggage,
  Percent,
  PieChart,
  PiggyBank,
  Plane,
  Plus,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  UserRoundX,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { errorMessage } from "@/core/api/errors";
import { useSession } from "@/core/auth/session-store";
import { formatDate, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { cn } from "@/core/ui/cn";
import { Card } from "@/core/ui/layout";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { useAdminDashboard } from "./api";

const REPORT_ICONS: Record<ReportName, LucideIcon> = {
  sales: TrendingUp,
  ageing: Clock,
  daybook: BookOpen,
  "lead-sources": PieChart,
  "leads-funnel": Filter,
  "staff-performance": Trophy,
  "partner-activity": Building,
  "upcoming-travel": CalendarRange,
};
const REPORT_ORDER: ReportName[] = ["sales", "ageing", "daybook", "lead-sources", "leads-funnel", "staff-performance", "partner-activity", "upcoming-travel"];

const LEAD_COLORS: Record<LeadStage, string> = {
  NEW: "bg-gold-400",
  CONTACTED: "bg-plum-200",
  QUOTATION: "bg-plum-500",
  WAITING_PAYMENT: "bg-plum-700",
  WON: "bg-emerald-500",
  LOST: "bg-red-400",
};
const BOOKING_COLORS: Record<BookingStatus, string> = {
  INQUIRY: "bg-ink-300",
  QUOTE: "bg-plum-200",
  PENDING_PAYMENT: "bg-gold-400",
  PENDING_APPROVAL: "bg-gold-300",
  IN_PROGRESS: "bg-plum-500",
  CONFIRMED: "bg-emerald-500",
  COMPLETED: "bg-emerald-700",
  CANCELLED: "bg-red-400",
  FAILED: "bg-red-600",
};

function Tile({ icon: Icon, label, value, hint, to, warn }: { icon: LucideIcon; label: string; value: string; hint?: string; to?: string; warn?: boolean }) {
  const body = (
    <div className={cn("flex h-full items-center gap-3 rounded-lg bg-white/10 px-3 py-3 ring-1 ring-white/10 transition", to && "hover:bg-white/15")}>
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-400/20 text-gold-300 xl:flex">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold tracking-wide text-plum-100 uppercase">{label}</p>
        <p className={cn("truncate text-lg leading-tight font-bold", warn ? "text-gold-300" : "text-white")}>{value}</p>
        {hint && <p className="truncate text-[11px] text-plum-200">{hint}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** One proportional bar with a legend — reads at a glance and takes two lines instead of eight. */
function Segmented<T extends string>({ title, data, labels, colors, order }: { title: string; data: Partial<Record<T, number>>; labels: Record<T, string>; colors: Record<T, string>; order: readonly T[] }) {
  const entries = order.map((key) => [key, data[key] ?? 0] as const).filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-bold tracking-wide text-ink-500 uppercase">{title}</h3>
        <span className="text-xs text-ink-500">{total} total</span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-ink-500">Nothing yet.</p>
      ) : (
        <>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={entries.map(([key, n]) => `${labels[key]}: ${n}`).join(", ")}>
            {entries.map(([key, n]) => (
              <span key={key} className={cn("h-full first:rounded-l-full last:rounded-r-full", colors[key])} style={{ width: `${(n / total) * 100}%` }} title={`${labels[key]}: ${n}`} />
            ))}
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {entries.map(([key, n]) => (
              <li key={key} className="flex items-center gap-1.5 text-xs text-ink-700">
                <span className={cn("h-2 w-2 rounded-full", colors[key])} aria-hidden />
                {labels[key]} <strong className="text-ink-900">{n}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const { user } = useSession("admin");
  const ability = useAbility("admin");
  const { data, isLoading, error } = useAdminDashboard();

  if (isLoading) return <FullPageSpinner />;
  if (error || !data) return <p className="py-10 text-center text-sm text-red-600">{errorMessage(error, "Unable to load the dashboard")}</p>;

  const { leads, bookings, tasks, payments, partners, receivables, departuresSoon, lowInventory, upcomingTrips, documents, content } = data;
  const openLeads = Object.entries(leads.byStage).reduce((sum, [stage, n]) => (stage === "WON" || stage === "LOST" ? sum : sum + (n ?? 0)), 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  // Everything that needs a person today, most urgent first. Empty means "all caught up".
  const attention = [
    { label: "Tasks overdue", count: tasks.overdue, to: "/admin/tasks?due=overdue", icon: ListTodo, urgent: true },
    { label: "Follow-ups overdue", count: leads.overdueFollowUps, to: "/admin/leads?followUp=overdue&view=list", icon: CalendarClock, urgent: true },
    { label: "Tasks due today", count: tasks.dueToday, to: "/admin/tasks", icon: ListTodo },
    { label: "Payments to verify", count: payments?.pendingVerification ?? 0, to: "/admin/payments?status=PENDING", icon: CreditCard },
    { label: "Bookings awaiting approval", count: bookings.awaitingApproval, to: "/admin/bookings?status=PENDING_APPROVAL", icon: Luggage },
    { label: "Leads with no owner", count: leads.unassigned, to: "/admin/leads?owner=unassigned", icon: Target },
    { label: "Partner applications", count: partners?.pendingApplications ?? 0, to: "/admin/partners?status=PENDING", icon: Building },
    { label: "Departing in 14 days, balance due", count: departuresSoon.length, to: "/admin/reports/ageing", icon: Clock },
    { label: "Confirmed trips leaving soon with no documents", count: documents?.tripsWithoutDocuments.length ?? 0, to: "/admin/bookings", icon: FileText, urgent: true },
    { label: "Travellers with passport problems", count: documents?.passportIssues.length ?? 0, to: "/admin/bookings", icon: ShieldAlert, urgent: true },
    { label: "Customer reviews to approve", count: content?.reviewsToApprove ?? 0, to: "/admin/testimonials", icon: Star },
    { label: "Flights leaving soon, few seats left", count: lowInventory.flightsDepartingSoon.length, to: "/admin/flight-inventory", icon: Plane },
  ].filter((a) => a.count > 0);
  const attentionTotal = attention.reduce((sum, a) => sum + a.count, 0);

  const quick = [
    { icon: Target, title: "Leads", add: ability.can("create", "Lead") ? "/admin/leads?new=1" : null, list: "/admin/leads", show: ability.can("read", "Lead") },
    { icon: Users, title: "Customers", add: ability.can("create", "Customer") ? "/admin/customers?new=1" : null, list: "/admin/customers", show: ability.can("read", "Customer") },
    { icon: Luggage, title: "Bookings", add: ability.can("create", "Booking") ? "/admin/bookings?new=1" : null, list: "/admin/bookings", show: ability.can("read", "Booking") },
    { icon: ListTodo, title: "Tasks", add: "/admin/tasks?new=1", list: "/admin/tasks", show: ability.can("read", "Task") },
    { icon: CreditCard, title: "Payments", add: null, list: "/admin/payments", show: ability.can("collect", "Booking") },
    { icon: Building, title: "Partners", add: null, list: "/admin/partners", show: ability.can("manage", "Partner") },
    { icon: Package, title: "Packages", add: ability.can("create", "Package") ? "/admin/packages" : null, list: "/admin/packages", show: ability.can("manage", "Package") },
    { icon: MapPin, title: "Destinations", add: ability.can("create", "Destination") ? "/admin/destinations" : null, list: "/admin/destinations", show: ability.can("manage", "Destination") },
    { icon: Star, title: "Testimonials", add: null, list: "/admin/testimonials", show: ability.can("manage", "Testimonial") },
  ].filter((q) => q.show);

  const reports = REPORT_ORDER.filter((name) =>
    name === "lead-sources" || name === "leads-funnel"
      ? ability.can("read", "Lead")
      : name === "staff-performance"
        ? ability.can("manage", "Booking")
        : name === "partner-activity"
          ? ability.can("read", "Partner")
          : ability.can("read", "Booking"),
  );
  const taskTotal = tasks.dueToday + tasks.overdue;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">
            {greeting}, {user?.name.split(" ")[0] ?? ""}
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">
            <span className="mr-2 rounded-full bg-plum-50 px-2 py-0.5 text-xs font-semibold text-plum-700">{ROLE_LABELS[data.role]}</span>
            {attentionTotal > 0 ? `${attentionTotal} item${attentionTotal > 1 ? "s" : ""} need your attention today.` : "You're all caught up."}
          </p>
        </div>
        <p className="hidden text-sm font-medium text-ink-500 sm:block">{dateLabel}</p>
      </div>

      {/* The top row follows the role: money for finance, documents for visa, content for the website team, pipeline for sales. */}
      <section aria-label="Overview" className="grid grid-cols-2 gap-2 rounded-xl bg-gradient-to-br from-plum-800 to-plum-950 p-2 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
        {content ? (
          <>
            <Tile icon={Package} label="Packages" hint="live on website" value={String(content.publishedPackages)} to="/admin/packages" />
            <Tile icon={FileText} label="Draft packages" hint="not published" value={String(content.draftPackages)} to="/admin/packages" warn={content.draftPackages > 0} />
            <Tile icon={MapPin} label="Destinations" hint="live on website" value={String(content.publishedDestinations)} to="/admin/destinations" />
            <Tile icon={Globe} label="Draft destinations" hint="not published" value={String(content.draftDestinations)} to="/admin/destinations" warn={content.draftDestinations > 0} />
            <Tile icon={Star} label="Reviews" hint="to approve" value={String(content.reviewsToApprove)} to="/admin/testimonials" warn={content.reviewsToApprove > 0} />
            <Tile icon={Plane} label="Departures" hint="open for booking" value={String(content.openDepartures)} to="/admin/packages" />
          </>
        ) : documents ? (
          <>
            <Tile icon={Luggage} label="Trips leaving" hint="next 14 days" value={String(upcomingTrips.length)} to="/admin/bookings" />
            <Tile icon={FileText} label="No documents" hint="trips within 30 days" value={String(documents.tripsWithoutDocuments.length)} to="/admin/bookings" warn={documents.tripsWithoutDocuments.length > 0} />
            <Tile icon={ShieldAlert} label="Passport issues" hint="within 60 days" value={String(documents.passportIssues.length)} warn={documents.passportIssues.length > 0} />
            <Tile icon={Users} label="Customers" value="Open" to="/admin/customers" />
            <Tile icon={ListTodo} label="Tasks" hint="due now" value={String(taskTotal)} to="/admin/tasks" warn={tasks.overdue > 0} />
            <Tile icon={Clock} label="Departing soon" hint="balance due" value={String(departuresSoon.length)} />
          </>
        ) : receivables ? (
          <>
            <Tile icon={Banknote} label="Collected" hint="this month" value={formatINR(receivables.collectedThisMonth)} to="/admin/reports/daybook" />
            <Tile icon={Hourglass} label="Pending dues" value={formatINR(receivables.pendingFromCustomers.amount)} hint={`${receivables.pendingFromCustomers.bookings} bookings`} to="/admin/reports/ageing" warn={receivables.pendingFromCustomers.amount > 0} />
            <Tile icon={PiggyBank} label="Advance" hint="on unconfirmed" value={formatINR(receivables.advanceFromCustomers)} />
            {bookings.revenueThisMonth !== null ? (
              <Tile icon={TrendingUp} label="Sales" hint="this month" value={formatINR(bookings.revenueThisMonth)} to="/admin/reports/sales" />
            ) : (
              <Tile icon={Clock} label="Departing soon" hint="balance due" value={String(departuresSoon.length)} to="/admin/reports/ageing" />
            )}
            {bookings.marginThisMonth !== null ? <Tile icon={Percent} label="Margin" hint="this month" value={formatINR(bookings.marginThisMonth)} /> : <Tile icon={ListTodo} label="Tasks" hint="due now" value={String(taskTotal)} to="/admin/tasks" warn={tasks.overdue > 0} />}
            <Tile icon={BadgeCheck} label="To verify" hint="payments" value={String(payments?.pendingVerification ?? 0)} to="/admin/payments?status=PENDING" warn={(payments?.pendingVerification ?? 0) > 0} />
          </>
        ) : data.role === "SUPPORT" ? (
          <>
            <Tile icon={Luggage} label="Trips leaving" hint="next 14 days" value={String(upcomingTrips.length)} to="/admin/bookings" />
            <Tile icon={UserPlus} label="New leads" hint="today" value={String(leads.newToday)} to="/admin/leads" />
            <Tile icon={Target} label="Open leads" value={String(openLeads)} to="/admin/leads" />
            <Tile icon={CalendarClock} label="Overdue" hint="follow-ups" value={String(leads.overdueFollowUps)} to="/admin/leads?followUp=overdue&view=list" warn={leads.overdueFollowUps > 0} />
            <Tile icon={ListTodo} label="Tasks" hint="due now" value={String(taskTotal)} to="/admin/tasks" warn={tasks.overdue > 0} />
            <Tile icon={Users} label="Customers" value="Open" to="/admin/customers" />
          </>
        ) : (
          <>
            <Tile icon={UserPlus} label="New leads" hint="today" value={String(leads.newToday)} to="/admin/leads" />
            <Tile icon={CalendarClock} label="Overdue" hint="follow-ups" value={String(leads.overdueFollowUps)} to="/admin/leads?followUp=overdue&view=list" warn={leads.overdueFollowUps > 0} />
            <Tile icon={UserRoundX} label="Unassigned" hint="leads" value={String(leads.unassigned)} to="/admin/leads?owner=unassigned" />
            <Tile icon={ListTodo} label="Tasks" hint="due now" value={String(taskTotal)} to="/admin/tasks" warn={tasks.overdue > 0} />
            <Tile icon={Hourglass} label="Approvals" hint="bookings waiting" value={String(bookings.awaitingApproval)} to="/admin/bookings?status=PENDING_APPROVAL" />
            <Tile icon={Clock} label="Departing soon" value={String(departuresSoon.length)} hint="balance due" />
          </>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card className="overflow-hidden shadow-xs">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="text-sm font-bold text-ink-900">Needs attention</h2>
              {attentionTotal > 0 && <span className="rounded-full bg-gold-50 px-2 py-0.5 text-xs font-bold text-gold-700">{attentionTotal}</span>}
            </div>
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Nothing needs a decision right now.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {attention.map((a) => (
                  <li key={a.label}>
                    <Link to={a.to} className={cn("group flex items-center gap-3 border-l-2 px-4 py-2 text-sm hover:bg-plum-50/50", a.urgent ? "border-red-400" : "border-transparent")}>
                      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", a.urgent ? "bg-red-50 text-red-600" : "bg-plum-50 text-plum-600")}>
                        <a.icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <span className="flex-1 text-ink-900">{a.label}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", a.urgent ? "bg-red-50 text-red-600" : "bg-plum-50 text-plum-700")}>{a.count}</span>
                      <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-plum-600" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(ability.can("read", "Lead") || ability.can("read", "Booking")) && (
            <Card className="grid gap-5 p-4 shadow-xs sm:grid-cols-2">
              {ability.can("read", "Lead") && <Segmented<LeadStage> title="Leads by stage" data={leads.byStage} labels={LEAD_STAGE_LABELS} colors={LEAD_COLORS} order={LEAD_STAGES} />}
              {ability.can("read", "Booking") && <Segmented<BookingStatus> title="Bookings by status" data={bookings.byStatus} labels={BOOKING_STATUS_LABELS} colors={BOOKING_COLORS} order={BOOKING_STATUSES} />}
            </Card>
          )}

          {documents && (documents.tripsWithoutDocuments.length > 0 || documents.passportIssues.length > 0) && (
            <Card className="overflow-hidden shadow-xs">
              <h2 className="border-b border-line px-4 py-2.5 text-sm font-bold text-ink-900">Documents to sort</h2>
              <ul className="divide-y divide-line">
                {documents.tripsWithoutDocuments.map((t) => (
                  <li key={`d-${t.id}`}>
                    <Link to={`/admin/bookings/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-plum-50/50">
                      <span className="truncate">
                        <span className="font-semibold">{t.refNo}</span> · {t.customerName}
                      </span>
                      <span className="shrink-0 text-xs text-ink-500">leaves {formatDate(t.travelFrom)} · <strong className="text-red-600">no documents</strong></span>
                    </Link>
                  </li>
                ))}
                {documents.passportIssues.map((p, i) => (
                  <li key={`p-${p.bookingId}-${i}`}>
                    <Link to={`/admin/bookings/${p.bookingId}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-plum-50/50">
                      <span className="truncate">
                        <span className="font-semibold">{p.refNo}</span> · {p.travelerName}
                      </span>
                      <span className="shrink-0 text-xs text-ink-500">{p.passportExpiry ? `passport expires ${formatDate(p.passportExpiry)}` : "no passport expiry on file"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {upcomingTrips.length > 0 && (
            <Card className="overflow-hidden shadow-xs">
              <h2 className="border-b border-line px-4 py-2.5 text-sm font-bold text-ink-900">Trips leaving in the next 14 days</h2>
              <ul className="divide-y divide-line">
                {upcomingTrips.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <Link to={`/admin/bookings/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-plum-50/50">
                      <span className="truncate">
                        <span className="font-semibold">{t.refNo}</span> · {t.customerName}
                      </span>
                      <span className="shrink-0 text-xs text-ink-500">
                        {formatDate(t.travelFrom)} · {t.documents} document{t.documents === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {reports.length > 0 && (
            <Card className="p-4 shadow-xs">
              <h2 className="mb-3 text-sm font-bold text-ink-900">Reports</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {reports.map((name) => {
                  const Icon = REPORT_ICONS[name];
                  return (
                    <Link key={name} to={`/admin/reports/${name}`} className="flex flex-col items-center gap-1.5 rounded-lg border border-line px-2 py-3 text-center transition hover:border-plum-300 hover:bg-plum-50/50">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-plum-50 text-plum-600">
                        <Icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <span className="text-xs leading-tight font-semibold text-ink-900">{REPORT_INFO[name].title}</span>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}

          {departuresSoon.length > 0 && (
            <Card className="overflow-hidden shadow-xs">
              <h2 className="border-b border-line px-4 py-2.5 text-sm font-bold text-ink-900">Departing soon — balance due</h2>
              <ul className="divide-y divide-line">
                {departuresSoon.slice(0, 5).map((d) => (
                  <li key={d.id}>
                    <Link to={`/admin/bookings/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-plum-50/50">
                      <span className="truncate">
                        <span className="font-semibold">{d.refNo}</span> · {d.customerName}
                      </span>
                      <span className="shrink-0 text-xs text-ink-500">
                        {formatDate(d.travelFrom)} · <strong className="text-red-600">{formatINR(d.balanceDue)}</strong>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4 shadow-xs">
            <h2 className="mb-3 text-sm font-bold text-ink-900">Quick actions</h2>
            <div className="grid grid-cols-3 gap-2">
              {quick.map((q) => (
                <div key={q.title} className="relative">
                  <Link to={q.list} className="flex flex-col items-center gap-1.5 rounded-lg border border-line px-1.5 py-3 text-center transition hover:border-plum-300 hover:bg-plum-50/50">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-plum-50 text-plum-600">
                      <q.icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="text-xs font-semibold text-ink-900">{q.title}</span>
                  </Link>
                  {q.add && (
                    <Link to={q.add} aria-label={`Add ${q.title.toLowerCase()}`} className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-plum-600 text-white hover:bg-plum-700">
                      <Plus className="h-3 w-3" aria-hidden />
                    </Link>
                  )}
                  {q.title === "Payments" && (payments?.pendingVerification ?? 0) > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-plum-950">{payments?.pendingVerification}</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
