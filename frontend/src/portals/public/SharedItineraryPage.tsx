import { PRODUCT_TYPE_LABELS, type PublicItinerary } from "@mashkoor/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, CheckCircle2, MapPin, Phone, Printer, ShieldAlert, Users, X } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { publicApi } from "@/core/api/client";
import { errorMessage } from "@/core/api/errors";
import { formatDate, formatINR, travellersLabel } from "@/core/format";
import { BrandName } from "@/core/ui/BrandName";
import { Button } from "@/core/ui/Button";
import { inputClass } from "@/core/ui/form";
import { Spinner } from "@/core/ui/Spinner";

/** `/i/:token` — the trip plan a consultant shared with a customer. Read-only, printable, with one "Accept" action. */
export function SharedItineraryPage() {
  const { token = "" } = useParams();
  const client = useQueryClient();
  const { data: trip, isLoading, error } = useQuery({ queryKey: ["public", "itinerary", token], queryFn: () => publicApi.get<PublicItinerary>(`/itineraries/${token}`), retry: false });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (isLoading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  if (error || !trip)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <ShieldAlert className="h-10 w-10 text-red-500" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">This quotation isn't available</h1>
        <p className="mt-1 max-w-sm text-sm text-ink-500">{errorMessage(error, "The link may have been withdrawn. Please contact your travel consultant.")}</p>
      </div>
    );

  const accept = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await publicApi.post(`/itineraries/${token}/accept`, { name });
      await client.invalidateQueries({ queryKey: ["public", "itinerary", token] });
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accepted = trip.status === "ACCEPTED" || trip.status === "CONVERTED";
  const total = trip.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) || trip.totalPrice;

  return (
    <div className="min-h-dvh bg-surface print:bg-white">
      <header className="bg-plum-950 px-4 py-4 text-white print:bg-white print:text-plum-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BrandName tone="onDark" size="md" className="print:text-plum-800" />
          <Button variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Print / save PDF
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <section className="rounded-2xl border border-line bg-white p-6">
          <p className="text-xs font-semibold tracking-wide text-plum-600 uppercase">{PRODUCT_TYPE_LABELS[trip.productType]}</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">{trip.title}</h1>
          {trip.customerName && <p className="mt-1 text-sm text-ink-500">Prepared for {trip.customerName}</p>}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-700">
            {trip.destination && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-plum-600" aria-hidden /> {trip.destination}
              </div>
            )}
            {trip.travelFrom && (
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-plum-600" aria-hidden /> {formatDate(trip.travelFrom)}
                {trip.travelTo ? ` → ${formatDate(trip.travelTo)}` : ""}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-plum-600" aria-hidden /> {travellersLabel(trip.adults, trip.children, 0)}
            </div>
          </dl>
        </section>

        {trip.days.length > 0 && (
          <section className="rounded-2xl border border-line bg-white p-6">
            <h2 className="mb-4 text-base font-semibold">Day by day</h2>
            <ol className="space-y-5">
              {trip.days.map((d) => (
                <li key={d.day} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-plum-50 text-sm font-semibold text-plum-700">{d.day}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900">{d.title}</h3>
                    {d.description && <p className="mt-1 text-sm whitespace-pre-line text-ink-700">{d.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(trip.inclusions.length > 0 || trip.exclusions.length > 0) && (
          <section className="grid gap-4 sm:grid-cols-2">
            {trip.inclusions.length > 0 && (
              <div className="rounded-2xl border border-line bg-white p-6">
                <h2 className="mb-3 text-base font-semibold">Included</h2>
                <ul className="space-y-1.5 text-sm">
                  {trip.inclusions.map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {trip.exclusions.length > 0 && (
              <div className="rounded-2xl border border-line bg-white p-6">
                <h2 className="mb-3 text-base font-semibold">Not included</h2>
                <ul className="space-y-1.5 text-sm">
                  {trip.exclusions.map((line) => (
                    <li key={line} className="flex gap-2">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden /> {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="mb-3 text-base font-semibold">Pricing</h2>
          {trip.lines.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {trip.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span>
                    {l.description}
                    {l.quantity > 1 && <span className="text-ink-500"> × {l.quantity}</span>}
                  </span>
                  <span className="font-semibold">{formatINR(l.quantity * l.unitPrice)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-display text-2xl font-semibold text-plum-700">{formatINR(total)}</span>
          </p>
          {trip.validUntil && !accepted && <p className="mt-1 text-right text-xs text-ink-500">{trip.expired ? "This quote has expired" : `Valid until ${formatDate(trip.validUntil)}`}</p>}
        </section>

        {trip.terms && (
          <section className="rounded-2xl border border-line bg-white p-6">
            <h2 className="mb-2 text-base font-semibold">Terms</h2>
            <p className="text-xs whitespace-pre-line text-ink-500">{trip.terms}</p>
          </section>
        )}

        <section className="rounded-2xl border border-line bg-white p-6 print:hidden">
          {accepted ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <h2 className="text-base font-semibold">You've accepted this quotation</h2>
                <p className="mt-1 text-sm text-ink-500">Our team will be in touch to confirm your booking and payment details.</p>
              </div>
            </div>
          ) : trip.expired ? (
            <p className="text-sm text-ink-700">This quote has expired. Please contact us to refresh it.</p>
          ) : (
            <>
              <h2 className="text-base font-semibold">Happy with this plan?</h2>
              <p className="mt-1 text-sm text-ink-500">Accepting lets our team know to go ahead. You won't be charged until you pay a payment link we send you.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input aria-label="Your full name" placeholder="Type your full name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                <Button onClick={() => void accept()} disabled={name.trim().length < 2} loading={busy} className="sm:w-40">
                  Accept plan
                </Button>
              </div>
              {problem && <p role="alert" className="mt-2 text-sm text-red-700">{problem}</p>}
            </>
          )}
        </section>

        <footer className="pb-6 text-center text-xs text-ink-500">
          <p className="font-semibold text-ink-700">{trip.company.name}</p>
          {trip.company.phones.length > 0 && (
            <p className="mt-1 flex items-center justify-center gap-1.5">
              <Phone className="h-3.5 w-3.5" aria-hidden /> {trip.company.phones.join(" · ")}
            </p>
          )}
          {trip.company.email && <p>{trip.company.email}</p>}
        </footer>
      </main>
    </div>
  );
}
