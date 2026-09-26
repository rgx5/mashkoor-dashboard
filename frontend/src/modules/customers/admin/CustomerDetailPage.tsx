import {
  CUSTOMER_TYPE_LABELS,
  formatPhone,
  BOOKING_DOCUMENT_KIND_LABELS,
  BOOKING_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  PRODUCT_TYPE_LABELS,
  TRAVELER_RELATION_LABELS,
  whatsappUrl,
  type CustomerDetail,
  type Traveler,
} from "@mashkoor/shared";
import { AlertTriangle, CreditCard, Download, Eye, FileText, GitMerge, KeyRound, Luggage, Mail, MessageCircle, Pencil, Phone, Plus, Send, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { errorMessage, withToast } from "@/core/api/errors";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@mashkoor/shared";
import { formatDate, formatDateTime, formatINR, travellersLabel } from "@/core/format";
import { Can } from "@/core/rbac/ability";
import { Button, buttonClass } from "@/core/ui/Button";
import { Badge, Card, EmptyState } from "@/core/ui/layout";
import { BackLink, DetailList, Tabs } from "@/core/ui/misc";
import { FullPageSpinner, Spinner } from "@/core/ui/Spinner";
import { Timeline } from "@/modules/activities";
import { NewBookingDialog, useBookings } from "@/modules/bookings";
import { downloadDocument } from "@/modules/bookings/admin/tripExperienceApi";
import { useLeads } from "@/modules/leads";
import { usePayments } from "@/modules/payments/api";
import { TasksPanel } from "@/modules/tasks";
import { revealPassport, useCustomer, useCustomerDocuments, useDeleteTraveler, useInvitePortalAccess, usePortalAccess } from "../api";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { MergeCustomerDialog } from "./MergeCustomerDialog";
import { TravelerDialog } from "./TravelerDialog";

type Tab = "timeline" | "travellers" | "leads" | "bookings" | "payments" | "documents";

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const { data: customer, isLoading, error } = useCustomer(id);
  const [tab, setTab] = useState<Tab>("timeline");
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  if (isLoading) return <FullPageSpinner />;
  if (error || !customer) return <EmptyState icon={AlertTriangle} title="Customer not available" description={errorMessage(error, "This customer may have been merged or removed.")} action={<Link to="/admin/customers" className={buttonClass("secondary")}>Back to customers</Link>} />;

  return (
    <>
      <BackLink to="/admin/customers">Customers</BackLink>

      {/* Header */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-plum-600 text-lg font-bold text-gold-300">
              <UserRound className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{customer.fullName}</h1>
                <Badge tone="plum">{CUSTOMER_TYPE_LABELS[customer.type]}</Badge>
                {customer.openLeads > 0 && <Badge tone="amber">{customer.openLeads} open lead{customer.openLeads > 1 ? "s" : ""}</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-500">
                {customer.refNo} · {customer.city ?? "City not set"} · Source: {LEAD_SOURCE_LABELS[customer.source]} · Owner: {customer.owner?.name ?? "Unassigned"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`tel:${customer.phone}`} className={buttonClass("secondary", "sm")}>
                  <Phone className="h-4 w-4" aria-hidden /> {formatPhone(customer.phone)}
                </a>
                <a href={whatsappUrl(customer.phone, `Assalamu Alaikum ${customer.fullName.split(" ")[0]},`)} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                  <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden /> WhatsApp
                </a>
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className={buttonClass("secondary", "sm")}>
                    <Mail className="h-4 w-4" aria-hidden /> {customer.email}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setBookingOpen(true)}>
              <Luggage className="h-4 w-4" aria-hidden /> New booking
            </Button>
            <Link to={`/admin/leads?new=1&customerId=${customer.id}`} className={buttonClass("secondary", "sm")}>
              <Plus className="h-4 w-4" aria-hidden /> New lead
            </Link>
            <Can portal="admin" I="update" a="Customer">
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </Button>
            </Can>
            <Can portal="admin" I="merge" a="Customer">
              <Button variant="ghost" size="sm" onClick={() => setMergeOpen(true)}>
                <GitMerge className="h-4 w-4" aria-hidden /> Merge duplicate
              </Button>
            </Can>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            className="mb-5"
            tabs={[
              { value: "timeline", label: "Timeline" },
              { value: "travellers", label: "Travellers", count: customer.travelers.length },
              { value: "leads", label: "Leads" },
              { value: "bookings", label: "Bookings" },
              { value: "payments", label: "Payments" },
              { value: "documents", label: "Documents" },
            ]}
          />
          {tab === "timeline" && <Timeline entityType="CUSTOMER" entityId={customer.id} showLeadLinks />}
          {tab === "travellers" && <TravellersTab customer={customer} />}
          {tab === "leads" && <CustomerLeads customerId={customer.id} />}
          {tab === "bookings" && <CustomerBookings customerId={customer.id} />}
          {tab === "payments" && <CustomerPayments customerId={customer.id} />}
          {tab === "documents" && <CustomerDocuments customerId={customer.id} />}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-base font-semibold">Details</h2>
            <DetailList
              items={[
                { label: "Alternate mobile", value: customer.altPhone ? formatPhone(customer.altPhone) : "—" },
                { label: "Preferred contact", value: customer.preferredChannel === "CALL" ? "Phone call" : customer.preferredChannel === "WHATSAPP" ? "WhatsApp" : "Email" },
                { label: "WhatsApp opt-in", value: customer.whatsappOptIn ? "Yes" : "No" },
                { label: "State", value: customer.state },
                { label: "Customer since", value: formatDate(customer.createdAt) },
                { label: "Tags", value: customer.tags.length ? customer.tags.join(", ") : "—" },
              ]}
            />
            {customer.notes && <p className="mt-4 rounded-lg bg-surface p-3 text-sm whitespace-pre-line text-ink-700">{customer.notes}</p>}
          </Card>
          <PortalAccessCard customerId={customer.id} />
          <TasksPanel customerId={customer.id} defaultTitle={`Follow up with ${customer.fullName.split(" ")[0]}`} />
        </aside>
      </div>

      <CustomerFormDialog open={editOpen} onClose={() => setEditOpen(false)} customer={customer} />
      <NewBookingDialog open={bookingOpen} onClose={() => setBookingOpen(false)} customerId={customer.id} />
      <MergeCustomerDialog open={mergeOpen} onClose={() => setMergeOpen(false)} customer={customer} />
    </>
  );
}

function TravellersTab({ customer }: { customer: CustomerDetail }) {
  const [editing, setEditing] = useState<Traveler | "new" | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const remove = useDeleteTraveler();

  const soon = (date: string | null) => date && new Date(date).getTime() < Date.now() + 180 * 24 * 3600 * 1000;

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Can portal="admin" I="create" a="Traveler">
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> Add traveller
          </Button>
        </Can>
      </div>
      {customer.travelers.length === 0 ? (
        <EmptyState icon={Luggage} title="No travellers yet" description="Add family or group members with their passport details." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {customer.travelers.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{[t.title, t.firstName, t.lastName].filter(Boolean).join(" ")}</p>
                  <p className="text-xs text-ink-500">
                    {TRAVELER_RELATION_LABELS[t.relation]} {t.dob ? `· Born ${formatDate(t.dob)}` : ""} {t.gender ? `· ${t.gender === "MALE" ? "Male" : "Female"}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Can portal="admin" I="update" a="Traveler">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label="Edit traveller">
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                  </Can>
                  <Can portal="admin" I="delete" a="Traveler">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove traveller"
                      onClick={() => window.confirm(`Remove ${t.firstName}?`) && withToast(remove.mutateAsync({ customerId: customer.id, travelerId: t.id }), "Traveller removed")}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </Can>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-ink-500">Passport:</span>
                <span className="font-mono">{revealed[t.id] ?? t.passportNo ?? "—"}</span>
                {t.passportNo && !revealed[t.id] && (
                  <Can portal="admin" I="reveal" a="Traveler">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-plum-700 hover:underline"
                      onClick={async () => {
                        try {
                          const { passportNo } = await revealPassport(customer.id, t.id);
                          if (passportNo) setRevealed((r) => ({ ...r, [t.id]: passportNo }));
                        } catch (e) {
                          toast.error(errorMessage(e));
                        }
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden /> Reveal
                    </button>
                  </Can>
                )}
                {t.passportExpiry && (
                  <span className={soon(t.passportExpiry) ? "font-semibold text-red-600" : "text-ink-500"}>
                    Expires {formatDate(t.passportExpiry)}
                    {soon(t.passportExpiry) && " — renew before travel"}
                  </span>
                )}
              </div>
              {t.specialNeeds && <p className="mt-2 rounded-md bg-gold-50 px-2 py-1 text-xs text-gold-700">{t.specialNeeds}</p>}
            </Card>
          ))}
        </div>
      )}
      <TravelerDialog open={editing !== null} onClose={() => setEditing(null)} customerId={customer.id} traveler={editing && editing !== "new" ? editing : undefined} />
    </>
  );
}

function CustomerLeads({ customerId }: { customerId: string }) {
  const { data, isLoading } = useLeads({ page: 1, customerId });
  if (isLoading) return null;
  if (!data?.data.length) return <EmptyState icon={Luggage} title="No leads for this customer" />;
  return (
    <Card className="divide-y divide-line">
      {data.data.map((l) => (
        <Link key={l.id} to={`/admin/leads/${l.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-plum-50/40">
          <span>
            <span className="font-semibold">{PRODUCT_TYPE_LABELS[l.productType]}</span>
            {l.destination && <span className="text-ink-500"> · {l.destination}</span>}
            <span className="block text-xs text-ink-500">
              {l.refNo} · {travellersLabel(l.adults, l.children, l.infants)} · {formatDate(l.createdAt)}
            </span>
          </span>
          <Badge tone={l.stage === "WON" ? "green" : l.stage === "LOST" ? "red" : "plum"}>{LEAD_STAGE_LABELS[l.stage]}</Badge>
        </Link>
      ))}
    </Card>
  );
}

function CustomerBookings({ customerId }: { customerId: string }) {
  const { data, isLoading } = useBookings({ page: 1, pageSize: 50, customerId });
  if (isLoading) return null;
  if (!data?.data.length) return <EmptyState icon={Luggage} title="No bookings for this customer" />;
  return (
    <Card className="divide-y divide-line">
      {data.data.map((b) => (
        <Link key={b.id} to={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-plum-50/40">
          <span>
            <span className="font-semibold">{PRODUCT_TYPE_LABELS[b.productType]}</span>
            {b.destination && <span className="text-ink-500"> · {b.destination}</span>}
            <span className="block text-xs text-ink-500">
              {b.refNo} · {formatDate(b.createdAt)}
            </span>
          </span>
          <Badge tone={b.status === "CONFIRMED" || b.status === "COMPLETED" ? "green" : b.status === "CANCELLED" || b.status === "FAILED" ? "red" : "plum"}>{BOOKING_STATUS_LABELS[b.status]}</Badge>
        </Link>
      ))}
    </Card>
  );
}

/** Every document across every booking this customer has — visas, tickets, vouchers, whatever's been shared or kept internal. */
function CustomerPayments({ customerId }: { customerId: string }) {
  const { data, isLoading } = usePayments({ customerId, page: 1, pageSize: 50 });
  if (isLoading) return <Spinner />;
  if (!data?.data.length) return <EmptyState icon={CreditCard} title="No payments yet" description="Payments are recorded on each booking." />;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {data.data.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <span className="font-semibold">{p.receiptNo}</span>
              <span className="block text-xs text-ink-500">
                {formatDateTime(p.createdAt)} · {PAYMENT_METHOD_LABELS[p.method]}
                {p.booking && (
                  <>
                    {" · "}
                    <Link to={`/admin/bookings/${p.booking.id}`} className="text-plum-700 hover:underline">
                      {p.booking.refNo}
                    </Link>
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={p.direction === "REFUND" ? "font-semibold text-red-600" : "font-semibold"}>{formatINR(p.amount)}</span>
              <Badge tone={p.status === "VERIFIED" ? "green" : p.status === "REJECTED" ? "red" : "amber"}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CustomerDocuments({ customerId }: { customerId: string }) {
  const { data, isLoading } = useCustomerDocuments(customerId);
  if (isLoading)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  if (!data?.length) return <EmptyState icon={FileText} title="No documents yet" description="Documents are attached to a booking and appear here across all of this customer's trips." />;
  return (
    <Card className="divide-y divide-line">
      {data.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span>
            <span className="font-semibold">{d.name}</span> <Badge tone="plum">{BOOKING_DOCUMENT_KIND_LABELS[d.kind]}</Badge>
            {!d.visibleToCustomer && <Badge tone="neutral">Internal only</Badge>}
            <span className="block text-xs text-ink-500">
              <Link to={`/admin/bookings/${d.booking.id}`} className="font-semibold text-plum-700 hover:underline">
                {d.booking.refNo}
              </Link>{" "}
              · {formatDate(d.createdAt)} · {(d.sizeBytes / 1024).toFixed(0)} KB
            </span>
          </span>
          <Button variant="ghost" size="sm" aria-label={`Download ${d.name}`} onClick={() => void downloadDocument(d.id, d.fileName).catch((e) => toast.error(errorMessage(e)))}>
            <Download className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
    </Card>
  );
}

/** Whether this customer can sign in to /b2c, and a way to give them access from here. */
function PortalAccessCard({ customerId }: { customerId: string }) {
  const { data: access, isLoading } = usePortalAccess(customerId);
  const invite = useInvitePortalAccess();

  const send = async () => {
    try {
      const result = await invite.mutateAsync(customerId);
      toast.success(result.emailed ? "Invitation emailed" : "Portal access is ready");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <KeyRound className="h-4 w-4 text-plum-600" aria-hidden /> Portal access
      </h2>
      {isLoading || !access ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : !access.hasEmail ? (
        <p className="text-sm text-ink-500">Add an email address to give this customer access to their trips online.</p>
      ) : access.status === "NONE" ? (
        <>
          <p className="mb-3 text-sm text-ink-500">No portal login yet. They'll sign in with {access.email} and a 6-digit code emailed each time — no password to set.</p>
          <Button size="sm" onClick={() => void send()} loading={invite.isPending}>
            <Send className="h-4 w-4" aria-hidden /> Invite to portal
          </Button>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Badge tone={access.status === "ACTIVE" ? "green" : "red"}>{access.status === "ACTIVE" ? "Active" : "Disabled"}</Badge>
            <span className="text-ink-500">{access.email}</span>
          </div>
          <p className="mb-3 text-xs text-ink-500">{access.lastLoginAt ? `Last signed in ${formatDate(access.lastLoginAt)}` : "Hasn't signed in yet"}</p>
          {access.status === "ACTIVE" && (
            <Button size="sm" variant="secondary" onClick={() => void send()} loading={invite.isPending}>
              <Send className="h-4 w-4" aria-hidden /> Resend welcome email
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
