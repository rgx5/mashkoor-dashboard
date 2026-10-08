import {
  ITINERARY_STATUS_LABELS,
  itineraryTotal,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  TRIP_TYPE_LABELS,
  TRIP_TYPES,
  type ItineraryDay,
  type ItineraryDetail,
  type ItineraryLine,
  type ProductType,
  type TripType,
  QUOTE_VALIDITY_DAYS,
  quoteValidityLabel,
  type FlightSegment,
  type HotelStay,
  type PaymentScheduleItem,
} from "@mashkoor/shared";
import { ChevronDown, Copy, ReceiptText, Download, ExternalLink, Eye, FileCheck2, Link2, Mail, Plus, Save, Send, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/core/api/client";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatDateTime, formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button, buttonClass } from "@/core/ui/Button";
import { Dialog } from "@/core/ui/Dialog";
import { Field, FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Badge, Card } from "@/core/ui/layout";
import { BackLink } from "@/core/ui/misc";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { useCurrencies } from "@/modules/currencies";
import { CustomerPicker } from "@/modules/customers/CustomerPicker";
import { LeadPicker } from "@/modules/leads/LeadPicker";
import { StaffSelect } from "@/modules/users";
import {
  useConvertItinerary,
  useCreateItinerary,
  useDeleteItinerary,
  useRestoreItinerary,
  useDuplicateItinerary,
  useItinerary,
  useSendItinerary,
  useShareItinerary,
  useUnshareItinerary,
  useUpdateItinerary,
  downloadQuotation,
} from "../api";
import { itineraryTone } from "./ItinerariesPage";
import { explainFieldErrors } from "./lineErrors";
import { PricingCard } from "./PricingCard";

interface FormState {
  title: string;
  productType: ProductType;
  tripType: TripType;
  isTemplate: boolean;
  customerId: string;
  leadId: string;
  relationshipManagerId: string;
  destination: string;
  travelFrom: string;
  travelTo: string;
  adults: number;
  children: number;
  days: ItineraryDay[];
  lines: ItineraryLine[];
  inclusions: string;
  exclusions: string;
  terms: string;
  paymentSchedule: PaymentScheduleItem[];
  subject: string;
  quoteDescription: string;
  quoteNotes: string;
  adjustment: number;
  fullPaymentDueDate: string;
  flights: FlightSegment[];
  hotels: HotelStay[];
}

const emptyForm: FormState = { title: "", productType: "HOLIDAY", tripType: "FIT", isTemplate: false, customerId: "", leadId: "", relationshipManagerId: "", destination: "", travelFrom: "", travelTo: "", adults: 2, children: 0, days: [], lines: [], inclusions: "", exclusions: "", terms: "", paymentSchedule: [], subject: "", quoteDescription: "", quoteNotes: "", adjustment: 0, fullPaymentDueDate: "", flights: [], hotels: [] };

const fromDetail = (d: ItineraryDetail): FormState => ({
  title: d.title,
  productType: d.productType,
  tripType: d.tripType,
  isTemplate: d.isTemplate,
  customerId: d.customer?.id ?? "",
  leadId: d.lead?.id ?? "",
  relationshipManagerId: d.relationshipManager?.id ?? "",
  destination: d.destination ?? "",
  travelFrom: d.travelFrom?.slice(0, 10) ?? "",
  travelTo: d.travelTo?.slice(0, 10) ?? "",
  adults: d.adults,
  children: d.children,
  days: d.days,
  lines: d.lines,
  inclusions: d.inclusions.join("\n"),
  exclusions: d.exclusions.join("\n"),
  terms: d.terms ?? "",
  paymentSchedule: d.paymentSchedule,
  subject: d.subject ?? "",
  quoteDescription: d.quoteDescription ?? "",
  quoteNotes: d.quoteNotes ?? "",
  adjustment: d.adjustment,
  fullPaymentDueDate: d.fullPaymentDueDate ?? "",
  flights: d.flights,
  hotels: d.hotels,
});

const splitLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

const toPayload = (f: FormState) => ({
  title: f.title,
  productType: f.productType,
  tripType: f.tripType,
  isTemplate: f.isTemplate,
  customerId: f.isTemplate ? null : f.customerId || null,
  leadId: f.isTemplate ? null : f.leadId || null,
  relationshipManagerId: f.isTemplate ? null : f.relationshipManagerId || null,
  destination: f.destination || null,
  travelFrom: f.travelFrom || null,
  travelTo: f.travelTo || null,
  adults: f.adults,
  children: f.children,
  days: f.days.map((d, i) => ({ ...d, day: i + 1 })),
  lines: f.lines,
  inclusions: splitLines(f.inclusions),
  exclusions: splitLines(f.exclusions),
  terms: f.terms || null,
  paymentSchedule: f.paymentSchedule,
  subject: f.subject || null,
  quoteDescription: f.quoteDescription || null,
  quoteNotes: f.quoteNotes || null,
  adjustment: f.adjustment,
  fullPaymentDueDate: f.fullPaymentDueDate || null,
  flights: f.flights,
  hotels: f.hotels,
});

/** Turns the server's `lines.2.description`-style paths into plain sentences, and says which pricing lines are at fault. */
/** Build or edit one itinerary. For a saved plan it also carries the share / email / convert actions. */
export function ItineraryEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ability = useAbility("admin");
  const { data: existing, isLoading } = useItinerary(id ?? "");
  const { data: currencies } = useCurrencies();
  const create = useCreateItinerary();
  const update = useUpdateItinerary();
  const restore = useRestoreItinerary();

  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm,
    isTemplate: params.get("template") === "1",
    customerId: params.get("customerId") ?? "",
    leadId: params.get("leadId") ?? "",
    destination: params.get("destination") ?? "",
    productType: (PRODUCT_TYPES as readonly string[]).includes(params.get("productType") ?? "") ? (params.get("productType") as ProductType) : "HOLIDAY",
    tripType: (TRIP_TYPES as readonly string[]).includes(params.get("tripType") ?? "") ? (params.get("tripType") as TripType) : "FIT",
    adults: Number(params.get("adults") ?? 2) || 2,
    children: Number(params.get("children") ?? 0) || 0,
  }));
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [badLines, setBadLines] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (existing && loadedId !== existing.id) {
      setForm(fromDetail(existing));
      setLoadedId(existing.id);
    }
  }, [existing, loadedId]);

  if (id && isLoading) return <FullPageSpinner />;

  const locked = existing ? existing.status === "ACCEPTED" || existing.status === "CONVERTED" : false;
  const archived = Boolean(existing?.archivedAt);
  const canEdit = !locked && !archived && ability.can(id ? "update" : "create", "Itinerary");
  const total = itineraryTotal(form.lines, form.adjustment);
  const patch = (changes: Partial<FormState>) => setForm((f) => ({ ...f, ...changes }));

  const save = async () => {
    setError(null);
    setProblems([]);
    setBadLines(new Set());
    try {
      if (id) {
        await update.mutateAsync({ id, input: toPayload(form) });
        toast.success("Quotation saved");
      } else {
        const created = await create.mutateAsync(toPayload(form));
        toast.success("Quotation created");
        navigate(`/admin/itineraries/${created.id}`, { replace: true });
      }
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length > 0) {
        const { messages, lines } = explainFieldErrors(e.fieldErrors);
        setProblems(messages);
        setBadLines(lines);
        setError("This quotation can't be saved yet. Fix the following:");
      } else {
        setError(errorMessage(e));
      }
    }
  };

  const setDay = (i: number, changes: Partial<ItineraryDay>) => patch({ days: form.days.map((d, n) => (n === i ? { ...d, ...changes } : d)) });

  return (
    <>
      <BackLink to={form.isTemplate ? "/admin/itineraries?view=templates" : "/admin/itineraries"}>Quotations</BackLink>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{id ? existing?.title ?? "Quotation" : form.isTemplate ? "New template" : "New quotation"}</h1>
        {existing && (
          <>
            <span className="text-sm text-ink-500">{existing.refNo}</span>
            {existing.isTemplate ? <Badge tone="amber">Template</Badge> : <Badge tone={itineraryTone(existing.status)}>{ITINERARY_STATUS_LABELS[existing.status]}</Badge>}
          </>
        )}
      </div>

      {existing && !existing.isTemplate && <ActionsBar itinerary={existing} onDeleted={() => navigate("/admin/itineraries", { replace: true })} />}
      {archived && existing && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gold-50 px-4 py-3 text-sm text-gold-700">
          <span>This quotation is in the archive. Its share link is switched off and it can't be edited until you restore it.</span>
          {ability.can("delete", "Itinerary") && (
            <Button size="sm" variant="secondary" loading={restore.isPending} onClick={() => void restore.mutateAsync(existing.id).then(() => toast.success("Restored from the archive"), (e) => toast.error(errorMessage(e)))}>
              <Undo2 className="h-4 w-4" aria-hidden /> Restore
            </Button>
          )}
        </div>
      )}
      {locked && <p className="mb-4 rounded-lg bg-gold-50 px-4 py-3 text-sm text-gold-700">This plan has been accepted, so it's locked. Duplicate it to make a new version.</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <FormError message={error} />
            {problems.length > 0 && (
              <ul className="list-disc space-y-0.5 rounded-lg bg-red-50 py-2 pr-3 pl-7 text-sm text-red-700">
                {problems.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            <TextField label="Title" required disabled={!canEdit} value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. 7 nights Umrah with Madinah stay" />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Product" disabled={!canEdit} value={form.productType} onChange={(e) => patch({ productType: e.target.value as ProductType })}>
                {PRODUCT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {PRODUCT_TYPE_LABELS[p]}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Trip type" disabled={!canEdit} value={form.tripType} onChange={(e) => patch({ tripType: e.target.value as TripType })}>
                {TRIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRIP_TYPE_LABELS[t]}
                  </option>
                ))}
              </SelectField>
              <TextField label="Destination" disabled={!canEdit} value={form.destination} onChange={(e) => patch({ destination: e.target.value })} />
              <TextField label="Departure" type="date" disabled={!canEdit} value={form.travelFrom} onChange={(e) => patch({ travelFrom: e.target.value })} />
              <TextField label="Return" type="date" disabled={!canEdit} min={form.travelFrom || undefined} value={form.travelTo} onChange={(e) => patch({ travelTo: e.target.value })} />
              <TextField label="Adults" type="number" min={0} disabled={!canEdit} value={form.adults} onChange={(e) => patch({ adults: Number(e.target.value) })} />
              <TextField label="Children" type="number" min={0} disabled={!canEdit} value={form.children} onChange={(e) => patch({ children: Number(e.target.value) })} />
            </div>
            {!form.isTemplate && (
              <div className={canEdit ? "" : "pointer-events-none opacity-70"}>
                <LeadPicker
                  value={form.leadId}
                  hint="Pick the lead this quotation is for. Customers are only created once the lead reaches Awaiting payment."
                  onChange={(lead) =>
                    patch(
                      lead
                        ? {
                            leadId: lead.id,
                            customerId: form.customerId || lead.customer?.id || "",
                            destination: form.destination || lead.destination || "",
                            travelFrom: form.travelFrom || lead.travelFrom?.slice(0, 10) || "",
                            travelTo: form.travelTo || lead.travelTo?.slice(0, 10) || "",
                            adults: form.adults || lead.adults,
                            children: form.children || lead.children,
                          }
                        : { leadId: "" },
                    )
                  }
                />
              </div>
            )}
            {!form.isTemplate && (
              <div className={canEdit ? "" : "pointer-events-none opacity-70"}>
                <CustomerPicker value={form.customerId} onChange={(customerId) => patch({ customerId })} hint="Needed to email the plan and to create a booking from it." />
              </div>
            )}
            {!form.isTemplate && (
              <Field label="Relationship manager" hint="Named on the quotation as the customer's contact. Leave blank to use the person who owns it.">
                <StaffSelect aria-label="Relationship manager" emptyLabel="Same as the owner" disabled={!canEdit} value={form.relationshipManagerId} onChange={(e) => patch({ relationshipManagerId: e.target.value })} />
              </Field>
            )}
            {canEdit && !id && (
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={form.isTemplate} onChange={(e) => patch({ isTemplate: e.target.checked })} /> Save as a reusable template (no customer, can't be shared)
              </label>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Day by day</h2>
              {canEdit && (
                <Button size="sm" variant="secondary" onClick={() => patch({ days: [...form.days, { day: form.days.length + 1, title: "", description: "" }] })}>
                  <Plus className="h-4 w-4" aria-hidden /> Add day
                </Button>
              )}
            </div>
            {form.days.length === 0 && <p className="text-sm text-ink-500">No days yet. Add the first day of the plan.</p>}
            <ol className="space-y-3">
              {form.days.map((d, i) => (
                <li key={i} className="rounded-lg border border-line p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-plum-50 text-xs font-semibold text-plum-700">{i + 1}</span>
                    <input aria-label={`Day ${i + 1} title`} className={inputClass} placeholder="Day title, e.g. Arrive Jeddah, transfer to Makkah" disabled={!canEdit} value={d.title} onChange={(e) => setDay(i, { title: e.target.value })} />
                    {canEdit && (
                      <Button variant="ghost" size="sm" aria-label={`Remove day ${i + 1}`} onClick={() => patch({ days: form.days.filter((_, n) => n !== i) })}>
                        <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                      </Button>
                    )}
                  </div>
                  <textarea aria-label={`Day ${i + 1} details`} rows={2} className={`${inputClass} mt-2`} placeholder="What happens on this day" disabled={!canEdit} value={d.description} onChange={(e) => setDay(i, { description: e.target.value })} />
                </li>
              ))}
            </ol>
          </Card>

          <PricingCard
            lines={form.lines}
            adjustment={form.adjustment}
            canEdit={canEdit}
            productType={form.productType}
            currencies={currencies ?? []}
            badLines={badLines}
            onClearBad={() => setBadLines(new Set())}
            onChange={(changes) => patch(changes)}
          />

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="text-base font-semibold sm:col-span-2">Quotation details</h2>
            <TextField label="Subject" hint="Defaults to the customer's name" disabled={!canEdit} value={form.subject} onChange={(e) => patch({ subject: e.target.value })} />
            <TextField label="Full payment due date" type="date" disabled={!canEdit} value={form.fullPaymentDueDate} onChange={(e) => patch({ fullPaymentDueDate: e.target.value })} />
            <TextareaField label="Description" rows={2} disabled={!canEdit} value={form.quoteDescription} onChange={(e) => patch({ quoteDescription: e.target.value })} />
            <TextareaField label="Notes" rows={2} disabled={!canEdit} value={form.quoteNotes} onChange={(e) => patch({ quoteNotes: e.target.value })} />
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Payment schedule</h2>
                <p className="text-xs text-ink-500">Optional. Leave empty to ask for full payment before departure.</p>
              </div>
              {canEdit && (
                <Button size="sm" variant="secondary" onClick={() => patch({ paymentSchedule: [...form.paymentSchedule, { label: form.paymentSchedule.length === 0 ? "1st payment" : `${form.paymentSchedule.length + 1}${["th", "st", "nd", "rd"][form.paymentSchedule.length + 1] ?? "th"} payment`, dueDate: null, amount: 0 }] })}>
                  <Plus className="h-4 w-4" aria-hidden /> Add instalment
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {form.paymentSchedule.map((p, i) => (
                <li key={i} className="grid grid-cols-[1fr_150px_120px_32px] items-center gap-2">
                  <input aria-label="Instalment name" className={inputClass} disabled={!canEdit} value={p.label} onChange={(e) => patch({ paymentSchedule: form.paymentSchedule.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)) })} />
                  <input aria-label="Due date" type="date" className={inputClass} disabled={!canEdit} value={p.dueDate ?? ""} onChange={(e) => patch({ paymentSchedule: form.paymentSchedule.map((x, n) => (n === i ? { ...x, dueDate: e.target.value || null } : x)) })} />
                  <input aria-label="Amount" type="number" min={0} className={inputClass} disabled={!canEdit} value={p.amount} onChange={(e) => patch({ paymentSchedule: form.paymentSchedule.map((x, n) => (n === i ? { ...x, amount: Number(e.target.value) } : x)) })} />
                  {canEdit && (
                    <button type="button" aria-label="Remove instalment" className="text-red-600" onClick={() => patch({ paymentSchedule: form.paymentSchedule.filter((_, n) => n !== i) })}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {form.paymentSchedule.length > 0 && (
              <p className={`mt-3 border-t border-line pt-3 text-sm ${form.paymentSchedule.reduce((n, p) => n + p.amount, 0) === total ? "text-emerald-700" : "text-gold-700"}`}>
                Scheduled {formatINR(form.paymentSchedule.reduce((n, p) => n + p.amount, 0))} of {formatINR(total)}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Flights</h2>
                <p className="text-xs text-ink-500">Printed as the trip table on the quotation. Optional.</p>
              </div>
              {canEdit && (
                <Button size="sm" variant="secondary" onClick={() => patch({ flights: [...form.flights, { tripType: form.flights.length ? "Return" : "Onward", departureCity: "", departureAt: "", arrivalCity: "", arrivalAt: "", airline: "", handCarry: "", checkInBaggage: "", zamzam: "" }] })}>
                  <Plus className="h-4 w-4" aria-hidden /> Add flight
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {form.flights.map((f, i) => (
                <li key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-4">
                  {(
                    [
                      ["tripType", "Trip type"],
                      ["departureCity", "From"],
                      ["departureAt", "Departs"],
                      ["arrivalCity", "To"],
                      ["arrivalAt", "Arrives"],
                      ["airline", "Airline"],
                      ["handCarry", "Hand carry"],
                      ["checkInBaggage", "Check-in baggage"],
                      ["zamzam", "Zamzam allowance"],
                    ] as const
                  ).map(([field, label]) => (
                    <input key={field} aria-label={label} placeholder={label} className={inputClass} disabled={!canEdit} value={f[field]} onChange={(e) => patch({ flights: form.flights.map((x, n) => (n === i ? { ...x, [field]: e.target.value } : x)) })} />
                  ))}
                  {canEdit && (
                    <button type="button" aria-label="Remove flight" className="flex items-center justify-center text-red-600" onClick={() => patch({ flights: form.flights.filter((_, n) => n !== i) })}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Hotels</h2>
                <p className="text-xs text-ink-500">Printed as the hotel table on the quotation. Optional.</p>
              </div>
              {canEdit && (
                <Button size="sm" variant="secondary" onClick={() => patch({ hotels: [...form.hotels, { city: "", hotel: "", distanceFromHaram: "", checkIn: "", checkOut: "" }] })}>
                  <Plus className="h-4 w-4" aria-hidden /> Add hotel
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {form.hotels.map((h, i) => (
                <li key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_32px]">
                  {(
                    [
                      ["city", "City"],
                      ["hotel", "Hotel"],
                      ["distanceFromHaram", "Distance from Haram"],
                      ["checkIn", "Check-in"],
                      ["checkOut", "Check-out"],
                    ] as const
                  ).map(([field, label]) => (
                    <input key={field} aria-label={label} placeholder={label} className={inputClass} disabled={!canEdit} value={h[field]} onChange={(e) => patch({ hotels: form.hotels.map((x, n) => (n === i ? { ...x, [field]: e.target.value } : x)) })} />
                  ))}
                  {canEdit && (
                    <button type="button" aria-label="Remove hotel" className="text-red-600" onClick={() => patch({ hotels: form.hotels.filter((_, n) => n !== i) })}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <TextareaField label="Included" hint="One per line" rows={5} disabled={!canEdit} value={form.inclusions} onChange={(e) => patch({ inclusions: e.target.value })} />
            <TextareaField label="Not included" hint="One per line" rows={5} disabled={!canEdit} value={form.exclusions} onChange={(e) => patch({ exclusions: e.target.value })} />
            <div className="sm:col-span-2">
              <TextareaField label="Terms & conditions" hint="Number each clause (1. Title) with the text on the next line" rows={8} disabled={!canEdit} value={form.terms} onChange={(e) => patch({ terms: e.target.value })} />
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {canEdit && (
            <Card className="p-5">
              <Button className="w-full" onClick={() => void save()} loading={create.isPending || update.isPending} disabled={form.title.trim().length < 2}>
                <Save className="h-4 w-4" aria-hidden /> {id ? "Save changes" : "Create quotation"}
              </Button>
              <p className="mt-2 text-center text-xs text-ink-500">Total {formatINR(total)}</p>
            </Card>
          )}
          {existing && !existing.isTemplate && <ShareActions itinerary={existing} />}
          {existing && <Insights itinerary={existing} />}
          {existing?.isTemplate && ability.can("create", "Itinerary") && <UseTemplate id={existing.id} />}
        </aside>
      </div>
    </>
  );
}

function Insights({ itinerary }: { itinerary: ItineraryDetail }) {
  if (itinerary.isTemplate) return null;
  return (
    <Card className="space-y-2 p-5 text-sm">
      <h2 className="text-base font-semibold">Customer activity</h2>
      {itinerary.status === "DRAFT" ? (
        <p className="text-ink-500">Not shared yet.</p>
      ) : (
        <>
          <p className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-plum-600" aria-hidden /> Opened {itinerary.viewCount} time{itinerary.viewCount === 1 ? "" : "s"}
          </p>
          {itinerary.lastViewedAt && <p className="text-xs text-ink-500">Last opened {formatDateTime(itinerary.lastViewedAt)}</p>}
          {itinerary.validUntil && <p className="text-xs text-ink-500">Valid until {formatDate(itinerary.validUntil)}</p>}
          {itinerary.acceptedAt && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
              Accepted by <strong>{itinerary.acceptedBy}</strong> on {formatDateTime(itinerary.acceptedAt)}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** Copy a template for a customer. */
function UseTemplate({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const duplicate = useDuplicateItinerary();
  const navigate = useNavigate();
  const go = async () => {
    try {
      const copy = await duplicate.mutateAsync({ id, customerId: customerId || null });
      navigate(`/admin/itineraries/${copy.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Card className="p-5">
      <Button className="w-full" variant="secondary" onClick={() => setOpen(true)}>
        <Copy className="h-4 w-4" aria-hidden /> Use for a customer
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Use this template" description="Makes an editable copy for the customer. The template itself stays as it is.">
        <div className="space-y-4">
          <CustomerPicker value={customerId} onChange={setCustomerId} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void go()} loading={duplicate.isPending}>
              Make a copy
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

/** Share link, email, withdraw, convert, duplicate, delete. */
/** What happens once the quotation exists: the customer's link, and turning it into a booking. Kept apart from the main buttons. */
function ShareActions({ itinerary }: { itinerary: ItineraryDetail }) {
  const ability = useAbility("admin");
  const navigate = useNavigate();
  const unshare = useUnshareItinerary();
  const send = useSendItinerary();
  const convert = useConvertItinerary();
  const canUpdate = ability.can("update", "Itinerary");
  const hasLink = itinerary.status === "SHARED" && Boolean(itinerary.shareUrl);
  const canConvert = canUpdate && itinerary.status !== "CONVERTED";
  const opened = itinerary.status === "CONVERTED" && Boolean(itinerary.convertedBookingId);
  if (!hasLink && !canConvert && !opened) return null;

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const copyLink = async () => {
    if (!itinerary.shareUrl) return;
    try {
      await navigator.clipboard.writeText(itinerary.shareUrl);
      toast.success("Link copied");
    } catch {
      window.prompt("Copy this link", itinerary.shareUrl);
    }
  };

  return (
    <Card className="space-y-3 p-5">
      {hasLink && itinerary.shareUrl && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-900">Customer link</p>
          <input aria-label="Share link" readOnly value={itinerary.shareUrl} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} w-full`} />
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
              <Copy className="h-4 w-4" aria-hidden /> Copy
            </Button>
            <a href={itinerary.shareUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
              <ExternalLink className="h-4 w-4" aria-hidden /> Preview
            </a>
            {canUpdate && (
              <Button
                variant="secondary"
                size="sm"
                loading={send.isPending}
                onClick={() =>
                  void run(async () => {
                    const result = await send.mutateAsync(itinerary.id);
                    if (result.sent) toast.success("Emailed to the customer");
                    else toast.error(result.reason ?? "Couldn't send the email");
                  })
                }
              >
                <Mail className="h-4 w-4" aria-hidden /> Email
              </Button>
            )}
          </div>
          {canUpdate && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => void run(() => unshare.mutateAsync(itinerary.id), "Link withdrawn")}>
              <Undo2 className="h-4 w-4" aria-hidden /> Withdraw link
            </Button>
          )}
        </div>
      )}
      {canConvert && (
        <Button
          variant={itinerary.status === "ACCEPTED" ? "primary" : "secondary"}
          className="w-full"
          loading={convert.isPending}
          onClick={() =>
            void run(async () => {
              const result = await convert.mutateAsync(itinerary.id);
              toast.success("Booking created");
              navigate(`/admin/bookings/${result.bookingId}`);
            })
          }
        >
          <FileCheck2 className="h-4 w-4" aria-hidden /> Create booking
        </Button>
      )}
      {opened && (
        <Link to={`/admin/bookings/${itinerary.convertedBookingId}`} className={buttonClass("primary", "md", "w-full")}>
          <Send className="h-4 w-4" aria-hidden /> Open booking
        </Link>
      )}
    </Card>
  );
}

function ActionsBar({ itinerary, onDeleted }: { itinerary: ItineraryDetail; onDeleted: () => void }) {
  const ability = useAbility("admin");
  const navigate = useNavigate();
  const share = useShareItinerary();
  const duplicate = useDuplicateItinerary();
  const remove = useDeleteItinerary();
  const [days, setDays] = useState("1");
  const [pdfMenu, setPdfMenu] = useState(false);
  const canUpdate = ability.can("update", "Itinerary");

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
      {!itinerary.isTemplate && (
        <div className="relative">
          <Button variant="secondary" size="sm" onClick={() => setPdfMenu(!pdfMenu)} aria-haspopup="menu" aria-expanded={pdfMenu}>
            <Download className="h-4 w-4" aria-hidden /> Download PDF <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </Button>
          {pdfMenu && (
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setPdfMenu(false)} />
              <div role="menu" className="absolute left-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2.5 text-left hover:bg-plum-50"
                  onClick={() => {
                    setPdfMenu(false);
                    void run(() => downloadQuotation(itinerary.id, `${itinerary.refNo}.pdf`, true));
                  }}
                >
                  <span className="block text-sm font-semibold text-ink-900">With price breakup</span>
                  <span className="block text-xs text-ink-500">Every item with its own price, discount and tax</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full border-t border-line px-4 py-2.5 text-left hover:bg-plum-50"
                  onClick={() => {
                    setPdfMenu(false);
                    void run(() => downloadQuotation(itinerary.id, `${itinerary.refNo}-package-price.pdf`, false));
                  }}
                >
                  <span className="block text-sm font-semibold text-ink-900">Without breakup</span>
                  <span className="block text-xs text-ink-500">The items, and one package price for all of them</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {!itinerary.isTemplate && itinerary.customer && ability.can("create", "Invoice") && (
        <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/invoices/new?quotationId=${itinerary.id}`)}>
          <ReceiptText className="h-4 w-4" aria-hidden /> Create invoice
        </Button>
      )}
      {canUpdate && itinerary.status === "DRAFT" && (
        <>
          <select aria-label="Link valid for" value={days} onChange={(e) => setDays(e.target.value)} className={`${inputClass} w-auto`}>
            {QUOTE_VALIDITY_DAYS.map((d) => (
              <option key={d} value={d}>
                Valid {quoteValidityLabel(d)}
              </option>
            ))}
          </select>
          <Button onClick={() => void run(() => share.mutateAsync({ id: itinerary.id, validForDays: Number(days) }), "Shared — copy the link or email it")} loading={share.isPending}>
            <Link2 className="h-4 w-4" aria-hidden /> Share with customer
          </Button>
        </>
      )}
      <span className="ml-auto flex gap-1">
        {ability.can("create", "Itinerary") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void run(async () => {
                const copy = await duplicate.mutateAsync({ id: itinerary.id, customerId: itinerary.customer?.id ?? null, leadId: itinerary.lead?.id ?? null });
                toast.success("Copy created");
                navigate(`/admin/itineraries/${copy.id}`);
              })
            }
          >
            <Copy className="h-4 w-4" aria-hidden /> Duplicate
          </Button>
        )}
        {ability.can("delete", "Itinerary") && !itinerary.archivedAt && (
          <Button
            variant="ghost"
            size="sm"
            title="Delete — moves it to the archive"
            onClick={() => {
              if (window.confirm(`Delete ${itinerary.refNo}? It moves to the archive and its share link stops working. You can restore it any time.`)) void run(async () => { await remove.mutateAsync(itinerary.id); onDeleted(); }, "Moved to the archive");
            }}
          >
            <Trash2 className="h-4 w-4 text-red-600" aria-hidden /> Delete
          </Button>
        )}
      </span>
    </Card>
  );
}
