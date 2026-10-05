import { itineraryTotal, PRODUCT_TYPE_LABELS, PRODUCT_TYPES, type InvoicePrefill, type ItineraryLine, type ProductType } from "@mashkoor/shared";
import { AlertTriangle, Lock, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/core/api/client";
import { errorMessage } from "@/core/api/errors";
import { formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { Button, buttonClass } from "@/core/ui/Button";
import { Field, FormError, inputClass, SelectField, TextareaField, TextField } from "@/core/ui/form";
import { Card, EmptyState } from "@/core/ui/layout";
import { BackLink } from "@/core/ui/misc";
import { FullPageSpinner } from "@/core/ui/Spinner";
import { useCurrencies } from "@/modules/currencies";
import { CustomerPicker } from "@/modules/customers/CustomerPicker";
import { explainFieldErrors, PricingCard, useItineraries } from "@/modules/itineraries";
import { fetchInvoicePrefill, useCreateInvoice, useInvoice, useInvoicePrefill, useUpdateInvoice } from "../api";

interface FormState {
  customerId: string;
  bookingId: string | null;
  itineraryId: string | null;
  productType: ProductType;
  subject: string;
  issueDate: string;
  dueDate: string;
  lines: ItineraryLine[];
  adjustment: number;
  notes: string;
  terms: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const empty: FormState = { customerId: "", bookingId: null, itineraryId: null, productType: "HOLIDAY", subject: "", issueDate: today(), dueDate: "", lines: [], adjustment: 0, notes: "", terms: "" };

const fromPrefill = (p: InvoicePrefill): FormState => ({ ...empty, customerId: p.customer.id, bookingId: p.bookingId, itineraryId: p.itineraryId, productType: p.productType, subject: p.subject ?? "", lines: p.lines, adjustment: p.adjustment, notes: p.notes ?? "", terms: p.terms ?? "" });

/**
 * Write an invoice the way a quotation is written: a customer, priced lines of any type (flight, hotel, meals, transport, visa or
 * anything else, with their details), an adjustment, notes and terms. Start from a quotation or a booking and its lines come
 * across, or start empty. With payments recorded the lines are fixed and only the wording and dates can change.
 */
export function InvoiceEditorPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ability = useAbility("admin");
  const { data: existing, isLoading: loadingExisting, error: existingError } = useInvoice(id ?? "");
  const source = { bookingId: params.get("bookingId") ?? undefined, quotationId: params.get("quotationId") ?? undefined };
  const { data: prefill, isLoading: loadingPrefill, error: prefillError } = useInvoicePrefill(editing ? {} : source);
  const { data: currencies } = useCurrencies();
  const create = useCreateInvoice();
  const update = useUpdateInvoice();

  const [form, setForm] = useState<FormState>(empty);
  const [customerLabel, setCustomerLabel] = useState("");
  const [bookingLabel, setBookingLabel] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [badLines, setBadLines] = useState<Set<number>>(new Set());
  const patch = (changes: Partial<FormState>) => setForm((f) => ({ ...f, ...changes }));

  useEffect(() => {
    if (loaded) return;
    if (existing) {
      setForm({
        customerId: existing.customer.id,
        bookingId: existing.booking.id,
        itineraryId: existing.itineraryId,
        productType: existing.productType,
        subject: existing.subject ?? "",
        issueDate: existing.issueDate,
        dueDate: existing.dueDate ?? "",
        lines: existing.lines,
        adjustment: existing.adjustment,
        notes: existing.notes ?? "",
        terms: existing.terms ?? "",
      });
      setCustomerLabel(`${existing.customer.fullName} · ${existing.customer.refNo}`);
      setBookingLabel(existing.booking.refNo);
      setLoaded(true);
    } else if (prefill) {
      setForm(fromPrefill(prefill));
      setCustomerLabel(`${prefill.customer.fullName} · ${prefill.customer.refNo}`);
      setLoaded(true);
    }
  }, [existing, prefill, loaded]);

  const { data: quotations } = useItineraries({ customerId: form.customerId || undefined, template: "false", pageSize: 50 });

  if (editing && loadingExisting) return <FullPageSpinner />;
  if (!editing && (source.bookingId || source.quotationId) && loadingPrefill) return <FullPageSpinner />;
  if (editing && (existingError || !existing))
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Invoice not available"
        description={errorMessage(existingError, "It may have been removed.")}
        action={
          <Link to="/admin/invoices" className={buttonClass("secondary")}>
            Back to invoices
          </Link>
        }
      />
    );

  const cancelled = existing?.state === "CANCELLED";
  const linesLocked = Boolean(existing?.linesLocked);
  const canWrite = !cancelled && ability.can(editing ? "update" : "create", "Invoice");
  const total = itineraryTotal(form.lines, form.adjustment);
  const customerFixed = editing || Boolean(form.bookingId);

  /** Pulls a quotation's lines, subject and terms into the invoice. */
  const copyFrom = async (quotationId: string) => {
    if (form.lines.length > 0 && !window.confirm("Replace the lines you have so far with the quotation's?")) return;
    try {
      const p = await fetchInvoicePrefill({ quotationId });
      setForm((f) => ({ ...f, itineraryId: p.itineraryId, bookingId: f.bookingId ?? p.bookingId, productType: p.productType, subject: f.subject || (p.subject ?? ""), lines: p.lines, adjustment: p.adjustment, notes: f.notes || (p.notes ?? ""), terms: f.terms || (p.terms ?? "") }));
      setBadLines(new Set());
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const save = async () => {
    setError(null);
    setProblems([]);
    setBadLines(new Set());
    try {
      if (id) {
        const saved = await update.mutateAsync({
          id,
          input: { subject: form.subject, issueDate: form.issueDate, dueDate: form.dueDate, notes: form.notes, terms: form.terms, ...(linesLocked ? {} : { lines: form.lines, adjustment: form.adjustment }) },
        });
        toast.success(`Invoice ${saved.refNo} saved`);
        navigate(`/admin/invoices/${saved.id}`);
      } else {
        const created = await create.mutateAsync({
          bookingId: form.bookingId,
          customerId: form.customerId,
          itineraryId: form.itineraryId,
          productType: form.productType,
          subject: form.subject,
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          lines: form.lines,
          adjustment: form.adjustment,
          notes: form.notes,
          terms: form.terms,
        });
        toast.success(`Invoice ${created.refNo} created`);
        navigate(`/admin/invoices/${created.id}`, { replace: true });
      }
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length > 0) {
        const { messages, lines } = explainFieldErrors(e.fieldErrors);
        setProblems(messages);
        setBadLines(lines);
        setError("This invoice can't be saved yet. Fix the following:");
      } else {
        setError(errorMessage(e));
      }
    }
  };

  return (
    <>
      <BackLink to={editing ? `/admin/invoices/${id}` : "/admin/invoices"}>{editing ? "Invoice" : "Invoices"}</BackLink>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{editing ? `Edit ${existing?.refNo}` : "New invoice"}</h1>
        {bookingLabel && <span className="text-sm text-ink-500">Booking {bookingLabel}</span>}
      </div>

      {prefillError && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage(prefillError)}</p>}
      {cancelled && <p className="mb-4 rounded-lg bg-gold-50 px-4 py-3 text-sm text-gold-700">This invoice has been cancelled, so it can't be edited.</p>}
      {linesLocked && !cancelled && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-gold-50 px-4 py-3 text-sm text-gold-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Payments are recorded against this invoice, so its lines and total are fixed. You can still change the subject, dates, notes and terms.</span>
        </p>
      )}

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
            <h2 className="text-base font-semibold">Bill to</h2>
            {customerFixed ? (
              <p className="rounded-lg bg-surface px-3.5 py-2.5 text-sm">
                <span className="font-semibold">{customerLabel || "Customer"}</span>
                {bookingLabel && <span className="text-ink-500"> · booking {bookingLabel}</span>}
              </p>
            ) : (
              <div className={canWrite ? "" : "pointer-events-none opacity-70"}>
                <CustomerPicker value={form.customerId} onChange={(customerId) => patch({ customerId })} required hint="Who the invoice is for." />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField label="Subject" hint="What the invoice is for, e.g. Umrah package, 7 nights" disabled={!canWrite} value={form.subject} onChange={(e) => patch({ subject: e.target.value })} />
              </div>
              <TextField label="Issue date" type="date" disabled={!canWrite} value={form.issueDate} onChange={(e) => patch({ issueDate: e.target.value })} />
              <TextField label="Due by" type="date" hint="Optional" min={form.issueDate || undefined} disabled={!canWrite} value={form.dueDate} onChange={(e) => patch({ dueDate: e.target.value })} />
              {!editing && !form.bookingId && (
                <SelectField label="Product" disabled={!canWrite} value={form.productType} onChange={(e) => patch({ productType: e.target.value as ProductType })}>
                  {PRODUCT_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {PRODUCT_TYPE_LABELS[p]}
                    </option>
                  ))}
                </SelectField>
              )}
              {!editing && form.customerId && (quotations?.data.length ?? 0) > 0 && (
                <Field label="Copy lines from a quotation" hint="Optional — brings across its items, adjustment and terms">
                  <select className={inputClass} disabled={!canWrite} value="" onChange={(e) => e.target.value && void copyFrom(e.target.value)}>
                    <option value="">Choose a quotation…</option>
                    {quotations?.data.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.refNo} · {q.title} · {formatINR(q.totalPrice)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </Card>

          <PricingCard
            lines={form.lines}
            adjustment={form.adjustment}
            canEdit={canWrite && !linesLocked}
            productType={form.productType}
            currencies={currencies ?? []}
            badLines={badLines}
            onClearBad={() => setBadLines(new Set())}
            onChange={(changes) => patch(changes)}
            emptyHint="Add the items to bill. Start from a quotation above, or add lines one by one."
          />

          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="text-base font-semibold sm:col-span-2">Notes & terms</h2>
            <TextareaField label="Notes" hint="Printed on the invoice" rows={4} disabled={!canWrite} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} />
            <TextareaField label="Terms & conditions" hint="Number each clause (1. Title) with the text on the next line" rows={4} disabled={!canWrite} value={form.terms} onChange={(e) => patch({ terms: e.target.value })} />
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {canWrite && (
            <Card className="p-5">
              <Button className="w-full" onClick={() => void save()} loading={create.isPending || update.isPending} disabled={!editing && (!form.customerId || form.lines.length === 0)}>
                <Save className="h-4 w-4" aria-hidden /> {editing ? "Save changes" : "Create invoice"}
              </Button>
              <p className="mt-2 text-center text-xs text-ink-500">Total {formatINR(total)}</p>
              {!editing && !form.bookingId && <p className="mt-3 rounded-lg bg-surface p-3 text-xs text-ink-700">A booking is created with this invoice, so payments, receivables and the accounts screens all work for it.</p>}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
