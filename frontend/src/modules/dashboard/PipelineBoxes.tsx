import { formatPhone, whatsappUrl, type EnquiryRow, type LeadRow } from "@mashkoor/shared";
import { MessageCircle, Phone } from "lucide-react";
import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router";
import { withToast } from "@/core/api/errors";
import { useAbility } from "@/core/rbac/ability";
import { Button, buttonClass } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { ContactedDialog, ConvertDialog, useAssignEnquiry, useEnquiryBoard } from "@/modules/enquiries";
import { StageChangeDialog, useAssignAccountant, useLeadBoard, type PendingStageChange } from "@/modules/leads";
import { StaffSelect } from "@/modules/users";

const DAY = 86_400_000;
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
const waitingLabel = (days: number) => (days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`);
const INITIAL_ROWS = 5;

/** One stage of the pipeline: a tinted box with a header and, under it, a white table of the people in it. A stage with nobody in it stays closed. */
function Box({ title, hint, count, href, owner, rows }: { title: string; hint: string; count: number; href: string; owner: string; rows: ReactNode[] }) {
  const [all, setAll] = useState(false);
  // Each row is numbered 1, 2, 3… so it's easy to say "number 3" or count what is waiting.
  const numbered = rows.map((r, i) => (isValidElement(r) ? cloneElement(r as ReactElement<{ index?: number }>, { index: i + 1 }) : r));
  const shown = all ? numbered : numbered.slice(0, INITIAL_ROWS);
  return (
    <section aria-label={title} className="rounded-xl bg-gradient-to-br from-plum-800 to-plum-950 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-1">
        <Link to={href} className="flex min-w-0 items-baseline gap-2 hover:underline">
          <h2 className={cn("text-sm font-bold", count > 0 ? "text-white" : "text-white/70")}>{title}</h2>
          <span className="hidden truncate text-xs text-plum-200 sm:inline">{hint}</span>
        </Link>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", count > 0 ? "bg-gold-400 text-plum-950" : "bg-white/10 text-white/60")}>{count}</span>
      </div>
      {rows.length > 0 && (
        <div className="mt-2.5 overflow-x-auto rounded-lg bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/60 text-[11px] tracking-wide text-ink-500 uppercase">
              <tr>
                <th scope="col" className="w-12 px-4 py-2 font-semibold">
                  #
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  {owner}
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Waiting
                </th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">{shown}</tbody>
          </table>
          {rows.length > INITIAL_ROWS && (
            <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line px-4 py-2 text-xs font-semibold text-plum-700 hover:bg-plum-50">
              {all ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ index, name, phone, owner, days, warn = true, children }: { index?: number; name: string; phone: string; owner: ReactNode; days: number; warn?: boolean; children: ReactNode }) {
  return (
    <tr className="hover:bg-plum-50/40">
      <td className="px-4 py-2.5 text-ink-500 tabular-nums">{index}</td>
      <td className="px-4 py-2.5">
        <span className="block font-semibold text-ink-900">{name}</span>
        <span className="block text-xs text-ink-500">{formatPhone(phone)}</span>
      </td>
      <td className="px-4 py-2.5 text-ink-500">{owner}</td>
      <td className={cn("px-4 py-2.5 whitespace-nowrap", warn && days >= 3 ? "font-semibold text-red-600" : "text-ink-500")}>{waitingLabel(days)}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1.5">{children}</div>
      </td>
    </tr>
  );
}

function Contact({ name, phone }: { name: string; phone: string }) {
  return (
    <>
      <a href={`tel:${phone}`} aria-label={`Call ${name}`} title={formatPhone(phone)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-700 hover:bg-plum-50">
        <Phone className="h-4 w-4" aria-hidden />
      </a>
      <a
        href={whatsappUrl(phone, `Assalamu Alaikum ${name.split(" ")[0]}, this is Mashkoor International Tourism.`)}
        target="_blank"
        rel="noreferrer"
        aria-label={`WhatsApp ${name}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-emerald-600 hover:bg-emerald-50"
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
      </a>
    </>
  );
}

/** The home page pipeline: one box per stage, one below another, each with that stage's actions on the row itself. */
export function PipelineBoxes() {
  const ability = useAbility("admin");
  const canEnquiries = ability.can("read", "Enquiry");
  const canLeads = ability.can("read", "Lead");
  const canAssignEnquiry = ability.can("assign", "Enquiry");
  const canAssignLead = ability.can("assign", "Lead");
  const canQuote = ability.can("create", "Itinerary");

  const enquiryBoard = useEnquiryBoard({}, canEnquiries);
  const leadBoard = useLeadBoard({}, canLeads);
  const assignEnquiry = useAssignEnquiry();
  const assignAccountant = useAssignAccountant();
  const [contacting, setContacting] = useState<EnquiryRow | null>(null);
  const [converting, setConverting] = useState<EnquiryRow | null>(null);
  const [pending, setPending] = useState<PendingStageChange | null>(null);

  if (!canEnquiries && !canLeads) return null;

  const eb = enquiryBoard.data;
  const enquiries = eb ? [...eb.unassigned.enquiries, ...eb.new.enquiries, ...eb.contacted.enquiries].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
  const enquiryTotal = eb ? eb.unassigned.total + eb.new.total + eb.contacted.total : 0;

  const lb = leadBoard.data;
  const oldestFirst = (a: LeadRow, b: LeadRow) => a.stageChangedAt.localeCompare(b.stageChangedAt);
  const requirements = lb ? [...lb.NEW.leads, ...lb.CONTACTED.leads].sort(oldestFirst) : [];
  const quotation = (lb?.QUOTATION.leads ?? []).slice().sort(oldestFirst);
  const awaiting = (lb?.WAITING_PAYMENT.leads ?? []).filter((l) => !l.accountant).sort(oldestFirst);
  const withAccounts = (lb?.WAITING_PAYMENT.leads ?? []).filter((l) => l.accountant).sort(oldestFirst);
  const won = (lb?.WON.leads ?? []).filter((l) => daysSince(l.stageChangedAt) <= 30).sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt));

  const quoteLink = (l: LeadRow) =>
    `/admin/itineraries/new?${new URLSearchParams({ leadId: l.id, ...(l.customer ? { customerId: l.customer.id } : {}), productType: l.productType, tripType: l.tripType, destination: l.destination ?? "", adults: String(l.adults), children: String(l.children) }).toString()}`;

  const open = (l: LeadRow) => (
    <Link key="open" to={`/admin/leads/${l.id}`} className={buttonClass("secondary", "sm")}>
      Open
    </Link>
  );
  const ownerOf = (l: LeadRow) => l.owner?.name ?? "—";

  return (
    <section aria-label="Pipeline" className="space-y-3">
      {canEnquiries && (
        <Box
          title="New enquiries"
          hint="Assign, call, then convert to a lead"
          count={enquiryTotal}
          href="/admin/enquiries"
          owner="Assigned to"
          rows={enquiries.map((e) => (
            <Row
              key={e.id}
              name={e.contactName}
              phone={e.phone}
              days={daysSince(e.createdAt)}
              owner={
                canAssignEnquiry ? (
                  <StaffSelect
                    roles={["SALES_AGENT", "OPS_MANAGER", "SUPER_ADMIN"]}
                    emptyLabel="Assign to…"
                    aria-label={`Assign ${e.contactName}`}
                    className="h-8 min-w-44 py-0 text-xs"
                    value={e.owner?.id ?? ""}
                    disabled={assignEnquiry.isPending}
                    onChange={(ev) => withToast(assignEnquiry.mutateAsync({ id: e.id, ownerId: ev.target.value || null }), "Enquiry assigned")}
                  />
                ) : (
                  (e.owner?.name ?? "—")
                )
              }
            >
              <Contact name={e.contactName} phone={e.phone} />
              {e.owner && e.status === "NEW" && (
                <Button size="sm" variant="secondary" onClick={() => setContacting(e)}>
                  Mark contacted
                </Button>
              )}
              {e.owner && (
                <Button size="sm" onClick={() => setConverting(e)}>
                  Convert to lead
                </Button>
              )}
            </Row>
          ))}
        />
      )}

      {canLeads && (
        <>
          <Box
            title="Requirements taken"
            hint="Spoken to the customer, now make the quotation"
            count={requirements.length}
            href="/admin/leads?stage=CONTACTED"
            owner="Owner"
            rows={requirements.map((l) => (
              <Row key={l.id} name={l.contactName} phone={l.phone} owner={ownerOf(l)} days={daysSince(l.stageChangedAt)}>
                <Contact name={l.contactName} phone={l.phone} />
                {canQuote && (
                  <Link to={quoteLink(l)} className={buttonClass("primary", "sm")}>
                    Create quotation
                  </Link>
                )}
                {open(l)}
              </Row>
            ))}
          />

          <Box
            title="Quotation sent"
            hint="Waiting for the customer to accept"
            count={quotation.length}
            href="/admin/leads?stage=QUOTATION"
            owner="Owner"
            rows={quotation.map((l) => (
              <Row key={l.id} name={l.contactName} phone={l.phone} owner={ownerOf(l)} days={daysSince(l.stageChangedAt)}>
                <Contact name={l.contactName} phone={l.phone} />
                {ability.can("update", "Lead") && (
                  <Button size="sm" onClick={() => setPending({ leadId: l.id, refNo: l.refNo, from: l.stage, to: "WAITING_PAYMENT" })}>
                    Move to payment
                  </Button>
                )}
                {open(l)}
              </Row>
            ))}
          />

          <Box
            title="Awaiting payment"
            hint="Accepted, now hand to an accountant"
            count={awaiting.length}
            href="/admin/leads?stage=WAITING_PAYMENT"
            owner="Owner"
            rows={awaiting.map((l) => (
              <Row key={l.id} name={l.contactName} phone={l.phone} owner={ownerOf(l)} days={daysSince(l.stageChangedAt)}>
                <Contact name={l.contactName} phone={l.phone} />
                {canAssignLead && (
                  <StaffSelect
                    roles={["ACCOUNTS", "SUPER_ADMIN"]}
                    emptyLabel="Assign accountant…"
                    aria-label={`Accountant for ${l.contactName}`}
                    className="h-8 min-w-44 py-0 text-xs"
                    value=""
                    disabled={assignAccountant.isPending}
                    onChange={(ev) => ev.target.value && withToast(assignAccountant.mutateAsync({ id: l.id, accountantId: ev.target.value }), "Handed to accounts")}
                  />
                )}
                {open(l)}
              </Row>
            ))}
          />

          <Box
            title="With accounts"
            hint="Accountant is invoicing and collecting payments"
            count={withAccounts.length}
            href="/admin/invoices"
            owner="Accountant"
            rows={withAccounts.map((l) => (
              <Row key={l.id} name={l.contactName} phone={l.phone} owner={l.accountant?.name ?? "—"} days={daysSince(l.stageChangedAt)}>
                <Contact name={l.contactName} phone={l.phone} />
                {open(l)}
              </Row>
            ))}
          />

          <Box
            title="Won (last 30 days)"
            hint="Paid in full"
            count={won.length}
            href="/admin/leads?stage=WON"
            owner="Owner"
            rows={won.map((l) => (
              <Row key={l.id} name={l.contactName} phone={l.phone} owner={ownerOf(l)} days={daysSince(l.stageChangedAt)} warn={false}>
                {open(l)}
              </Row>
            ))}
          />
        </>
      )}

      <ContactedDialog enquiry={contacting} onClose={() => setContacting(null)} />
      <ConvertDialog enquiry={converting} onClose={() => setConverting(null)} />
      <StageChangeDialog pending={pending} onClose={() => setPending(null)} />
    </section>
  );
}
