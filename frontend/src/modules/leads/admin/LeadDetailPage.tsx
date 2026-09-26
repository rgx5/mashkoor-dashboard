import { zodResolver } from "@hookform/resolvers/zod";
import {
  formatPhone,
  LEAD_PRIORITIES,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  LOST_REASON_LABELS,
  OPEN_LEAD_STAGES,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  TRIP_TYPE_LABELS,
  TRIP_TYPES,
  leadUpdateSchema,
  whatsappUrl,
  type LeadDetail,
  type LeadStage,
} from "@mashkoor/shared";
import { AlertTriangle, CalendarRange, Check, Mail, MessageCircle, Pencil, Phone, UserPlus, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { ApiError } from "@/core/api/client";
import { applyApiErrors, errorMessage, withToast } from "@/core/api/errors";
import { formatDate, formatDateTime, formatINR, fromLocalInput, isOverdue, timeAgo, toLocalInput, travellersLabel } from "@/core/format";
import { useSession } from "@/core/auth/session-store";
import { useAbility } from "@/core/rbac/ability";
import { Button, buttonClass } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Dialog } from "@/core/ui/Dialog";
import { FormError, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, Card, EmptyState } from "@/core/ui/layout";
import { BackLink, DetailList } from "@/core/ui/misc";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { Timeline } from "@/modules/activities";
import { DuplicateNotice, type DuplicateMatch } from "@/modules/customers";
import { TasksPanel } from "@/modules/tasks";
import { StaffSelect } from "@/modules/users";
import { useAssignLead, useConvertLead, useLead, useUpdateLead } from "../api";
import { StageChangeDialog, type PendingStageChange } from "../StageChangeDialog";

const PATH: LeadStage[] = [...OPEN_LEAD_STAGES, "WON"];

export function LeadDetailPage() {
  const { id = "" } = useParams();
  const { data: lead, isLoading, error } = useLead(id);
  const [pending, setPending] = useState<PendingStageChange | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const ability = useAbility("admin");

  if (isLoading) return <FullPageSpinner />;
  if (error || !lead)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Lead not available"
        description={errorMessage(error, "It may have been removed, or it belongs to another agent.")}
        action={
          <Link to="/admin/leads" className={buttonClass("secondary")}>
            Back to leads
          </Link>
        }
      />
    );

  const closed = lead.stage === "WON" || lead.stage === "LOST";
  const move = (to: LeadStage) => setPending({ leadId: lead.id, refNo: lead.refNo, from: lead.stage, to });

  return (
    <>
      <BackLink to="/admin/leads">Leads</BackLink>

      {/* Header */}
      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{lead.contactName}</h1>
              <Badge tone={lead.priority === "HOT" ? "red" : lead.priority === "WARM" ? "amber" : "neutral"}>{lead.priority.toLowerCase()}</Badge>
              {lead.stage === "LOST" && lead.lostReason && <Badge tone="red">Lost · {LOST_REASON_LABELS[lead.lostReason]}</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-500">
              {lead.refNo} · {LEAD_SOURCE_LABELS[lead.source]}
              {lead.sourceDetail ? ` (${lead.sourceDetail})` : ""} · received {timeAgo(lead.createdAt)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`tel:${lead.phone}`} className={buttonClass("secondary", "sm")}>
                <Phone className="h-4 w-4" aria-hidden /> {formatPhone(lead.phone)}
              </a>
              <a href={whatsappUrl(lead.phone, `Assalamu Alaikum ${lead.contactName.split(" ")[0]}, this is Mashkoor International Tourism regarding your ${PRODUCT_TYPE_LABELS[lead.productType]} enquiry.`)} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden /> WhatsApp
              </a>
              {lead.email && (
                <a href={`mailto:${lead.email}`} className={buttonClass("secondary", "sm")}>
                  <Mail className="h-4 w-4" aria-hidden /> Email
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ability.can("create", "Itinerary") && (
              <Link
                to={`/admin/itineraries/new?${new URLSearchParams({
                  leadId: lead.id,
                  ...(lead.customer ? { customerId: lead.customer.id } : {}),
                  productType: lead.productType,
                  tripType: lead.tripType,
                  destination: lead.destination ?? "",
                  adults: String(lead.adults),
                  children: String(lead.children),
                }).toString()}`}
                className={buttonClass("secondary", "sm")}
              >
                <CalendarRange className="h-4 w-4" aria-hidden /> Create itinerary
              </Link>
            )}
            {!closed && (
              <Button variant="danger" size="sm" onClick={() => move("LOST")}>
                Mark lost
              </Button>
            )}
            {closed && (
              <Button variant="secondary" size="sm" onClick={() => move("CONTACTED")}>
                Reopen
              </Button>
            )}
          </div>
        </div>

        {/* Stage stepper */}
        <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {PATH.map((stage, i) => {
            const currentIndex = PATH.indexOf(lead.stage);
            const done = currentIndex > i || lead.stage === "WON";
            const current = lead.stage === stage;
            return (
              <li key={stage}>
                <button
                  type="button"
                  disabled={current}
                  onClick={() => move(stage)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition",
                    current ? "border-plum-600 bg-plum-600 text-white" : done ? "border-plum-200 bg-plum-50 text-plum-700 hover:bg-plum-100" : "border-line bg-white text-ink-500 hover:border-plum-200",
                  )}
                >
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]", current ? "bg-gold-400 text-plum-950" : done ? "bg-plum-600 text-white" : "bg-surface")}>
                    {done && !current ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
                  </span>
                  {LEAD_STAGE_LABELS[stage]}
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Travel requirements</h2>
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </Button>
            </div>
            <DetailList
              items={[
                { label: "Trip", value: PRODUCT_TYPE_LABELS[lead.productType] },
                { label: "Destination", value: lead.destination },
                { label: "Dates", value: lead.travelFrom ? `${formatDate(lead.travelFrom)}${lead.travelTo ? ` → ${formatDate(lead.travelTo)}` : ""}${lead.flexibleDates ? " (flexible)" : ""}` : lead.flexibleDates ? "Flexible" : "—" },
                { label: "Travellers", value: travellersLabel(lead.adults, lead.children, lead.infants) },
                { label: "Budget", value: lead.budgetMin || lead.budgetMax ? `${formatINR(lead.budgetMin)} – ${formatINR(lead.budgetMax)}` : "—" },
                { label: "Quoted", value: lead.quotedAmount ? formatINR(lead.quotedAmount) : "—" },
                { label: "Trip type", value: TRIP_TYPE_LABELS[lead.tripType] },
                { label: "Last contacted", value: lead.lastContactedAt ? timeAgo(lead.lastContactedAt) : "Not yet" },
              ]}
            />
            {lead.requirements && <p className="mt-4 rounded-lg bg-surface p-3 text-sm whitespace-pre-line text-ink-700">{lead.requirements}</p>}
          </Card>

          <section>
            <h2 className="mb-3 text-base font-semibold">Activity</h2>
            <Timeline entityType="LEAD" entityId={lead.id} />
          </section>
        </div>

        <aside className="space-y-6">
          <OwnerCard lead={lead} />
          <CustomerCard lead={lead} />
          <TasksPanel leadId={lead.id} defaultTitle={`Follow up with ${lead.contactName.split(" ")[0]}`} />
          {lead.attribution && Object.values(lead.attribution).some(Boolean) && (
            <Card className="p-5">
              <h2 className="mb-3 text-base font-semibold">Source details</h2>
              <dl className="space-y-1.5 text-xs">
                {Object.entries(lead.attribution)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-ink-500">{k}</dt>
                      <dd className="truncate text-right font-medium" title={String(v)}>
                        {String(v)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </Card>
          )}
        </aside>
      </div>

      <StageChangeDialog pending={pending} onClose={() => setPending(null)} />
      <EditLeadDialog lead={lead} open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  );
}

function OwnerCard({ lead }: { lead: LeadDetail }) {
  const ability = useAbility("admin");
  const { user } = useSession("admin");
  const assign = useAssignLead();
  const canAssign = ability.can("assign", "Lead");

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-base font-semibold">Owner & follow-up</h2>
      {canAssign ? (
        <StaffSelect value={lead.owner?.id ?? ""} onChange={(e) => withToast(assign.mutateAsync({ id: lead.id, ownerId: e.target.value || null }), "Owner updated")} aria-label="Lead owner" />
      ) : lead.owner ? (
        <p className="text-sm font-semibold">{lead.owner.name}</p>
      ) : (
        <Button size="sm" className="w-full" onClick={() => user && withToast(assign.mutateAsync({ id: lead.id, ownerId: user.id }), "Lead assigned to you")}>
          <UserPlus className="h-4 w-4" aria-hidden /> Take this lead
        </Button>
      )}
      <p className={cn("mt-3 text-sm", lead.nextFollowUpAt && isOverdue(lead.nextFollowUpAt) ? "font-semibold text-red-600" : "text-ink-500")}>
        Next follow-up: {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : "not set"}
      </p>
    </Card>
  );
}

function CustomerCard({ lead }: { lead: LeadDetail }) {
  const convert = useConvertLead();
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);

  const run = async (customerId?: string) => {
    try {
      await convert.mutateAsync({ id: lead.id, customerId });
      setDuplicates([]);
      toast.success(customerId ? "Linked to customer" : "Customer created");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setDuplicates((error.details as { duplicates?: DuplicateMatch[] })?.duplicates ?? []);
        return;
      }
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-base font-semibold">Customer</h2>
      {lead.customer ? (
        <Link to={`/admin/customers/${lead.customer.id}`} className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3 hover:bg-emerald-100">
          <UserRoundCheck className="h-5 w-5 text-emerald-700" aria-hidden />
          <span className="text-sm">
            <span className="block font-semibold text-emerald-800">{lead.customer.fullName}</span>
            <span className="text-xs text-emerald-700">{lead.customer.refNo} · open Customer 360</span>
          </span>
        </Link>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-500">Not yet a customer. Convert once the enquiry is qualified.</p>
          {duplicates.length > 0 ? (
            <DuplicateNotice matches={duplicates} onUse={(m) => run(m.id)} useLabel="Link" />
          ) : (
            <Button size="sm" className="w-full" loading={convert.isPending} onClick={() => run()}>
              Convert to customer
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

type EditIn = z.input<typeof leadUpdateSchema>;
type EditOut = z.output<typeof leadUpdateSchema>;

function EditLeadDialog({ lead, open, onClose }: { lead: LeadDetail; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit lead" size="lg">
      <EditLeadForm lead={lead} onDone={onClose} />
    </Dialog>
  );
}

function EditLeadForm({ lead, onDone }: { lead: LeadDetail; onDone: () => void }) {
  const update = useUpdateLead();
  const [formError, setFormError] = useState<string | null>(null);
  // datetime-local works in local IST time; converted to an ISO instant on submit.
  const [followUp, setFollowUp] = useState(toLocalInput(lead.nextFollowUpAt));
  const { register, handleSubmit, setError, formState } = useForm<EditIn, unknown, EditOut>({
    resolver: zodResolver(leadUpdateSchema),
    defaultValues: {
      contactName: lead.contactName,
      phone: lead.phone,
      email: lead.email,
      priority: lead.priority,
      productType: lead.productType,
      tripType: lead.tripType,
      destination: lead.destination,
      travelFrom: lead.travelFrom,
      travelTo: lead.travelTo,
      flexibleDates: lead.flexibleDates,
      adults: lead.adults,
      children: lead.children,
      infants: lead.infants,
      budgetMin: lead.budgetMin,
      budgetMax: lead.budgetMax,
      quotedAmount: lead.quotedAmount,
      requirements: lead.requirements,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await update.mutateAsync({ id: lead.id, ...values, nextFollowUpAt: fromLocalInput(followUp) });
      toast.success("Lead updated");
      onDone();
    } catch (error) {
      setFormError(applyApiErrors(error, setError));
    }
  });

  const numberOrNull = (v: string) => (v === "" || v == null ? null : Number(v));

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Contact name" error={formState.errors.contactName?.message} {...register("contactName")} />
        <TextField label="Mobile" type="tel" error={formState.errors.phone?.message} {...register("phone")} />
        <TextField label="Email" type="email" error={formState.errors.email?.message} {...register("email")} />
        <SelectField label="Product" {...register("productType")}>
          {PRODUCT_TYPES.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_TYPE_LABELS[p]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Trip type" {...register("tripType")}>
          {TRIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRIP_TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <TextField label="Destination" {...register("destination")} />
        <SelectField label="Priority" {...register("priority")}>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </SelectField>
        <TextField label="Departure" type="date" error={formState.errors.travelFrom?.message} {...register("travelFrom")} />
        <TextField label="Return" type="date" error={formState.errors.travelTo?.message} {...register("travelTo")} />
        <TextField label="Next follow-up" type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        <TextField label="Adults" type="number" min={0} {...register("adults")} />
        <TextField label="Children" type="number" min={0} {...register("children")} />
        <TextField label="Infants" type="number" min={0} {...register("infants")} />
        <TextField label="Budget from (₹)" type="number" min={0} error={formState.errors.budgetMin?.message} {...register("budgetMin", { setValueAs: numberOrNull })} />
        <TextField label="Budget to (₹)" type="number" min={0} error={formState.errors.budgetMax?.message} {...register("budgetMax", { setValueAs: numberOrNull })} />
        <TextField label="Quoted (₹)" hint="What we told them, before an itinerary exists" type="number" min={0} error={formState.errors.quotedAmount?.message} {...register("quotedAmount", { setValueAs: numberOrNull })} />
      </div>
      <TextareaField label="Requirements" rows={4} {...register("requirements")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
