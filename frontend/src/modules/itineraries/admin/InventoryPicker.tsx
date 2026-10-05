import { MEAL_PLAN_LABELS, nightsBetween, type ItineraryLineAttrs, type ProductType } from "@mashkoor/shared";
import { ArrowRight, BedDouble, Bus, Plane, Search } from "lucide-react";
import { useState } from "react";
import { formatDate, formatDateTime, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { inputClass } from "@/core/ui/form";
import { Spinner } from "@/core/ui/Spinner";
import { useQuoteFlights, useQuoteRooms, useQuoteTransport } from "../api";

const istDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));

const Filter = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-ink-700">{label}</span>
    {children}
  </label>
);

/**
 * Finds a hotel room or a flight in our own inventory and fills the line in from it, priced for the customer by the pricing
 * rules (supplier cost is never shown). It lists what we have straight away; every filter is optional and narrows the list.
 * Once something is picked it folds away into a "Search again" button.
 */
export function InventoryPicker({
  kind,
  attrs,
  productType,
  disabled,
  onPick,
}: {
  kind: "HOTEL" | "FLIGHT" | "TRANSPORT";
  attrs: ItineraryLineAttrs;
  productType: ProductType;
  disabled: boolean;
  onPick: (change: Partial<ItineraryLineAttrs>, unitPrice: number) => void;
}) {
  const alreadyFilled = kind === "HOTEL" ? Boolean(attrs.hotel) : kind === "FLIGHT" ? Boolean(attrs.airline) : Boolean(attrs.vehicle);
  const [open, setOpen] = useState(!alreadyFilled);
  const [city, setCity] = useState(attrs.city ?? "");
  const [checkIn, setCheckIn] = useState(attrs.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(attrs.checkOut ?? "");
  const [origin, setOrigin] = useState(attrs.from?.length === 3 ? attrs.from.toUpperCase() : "");
  const [destination, setDestination] = useState(attrs.to?.length === 3 ? attrs.to.toUpperCase() : "");
  const [from, setFrom] = useState(attrs.departureDate ?? "");
  const [fromPlace, setFromPlace] = useState(attrs.from ?? "");
  const [toPlace, setToPlace] = useState(attrs.to ?? "");

  const nights = nightsBetween(checkIn, checkOut);
  const hotelDatesBad = Boolean(checkIn && checkOut && checkOut <= checkIn);
  const rooms = useQuoteRooms({ kind: "HOTEL", productType, city: city.trim() || undefined, from: checkIn || undefined, to: checkOut || undefined }, open && kind === "HOTEL" && !hotelDatesBad);
  const flights = useQuoteFlights(
    { kind: "FLIGHT", productType, origin: origin.length === 3 ? origin : undefined, destination: destination.length === 3 ? destination : undefined, from: from || undefined },
    open && kind === "FLIGHT",
  );

  const transport = useQuoteTransport({ kind: "TRANSPORT", productType, fromPlace: fromPlace.trim() || undefined, toPlace: toPlace.trim() || undefined }, open && kind === "TRANSPORT");

  if (disabled) return null;

  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" aria-hidden /> Search again in our {kind === "HOTEL" ? "hotels" : kind === "FLIGHT" ? "flights" : "transport"}
      </Button>
    );
  }

  const query = kind === "HOTEL" ? rooms : kind === "FLIGHT" ? flights : transport;
  const Icon = kind === "HOTEL" ? BedDouble : kind === "FLIGHT" ? Plane : Bus;
  const noun = kind === "HOTEL" ? "hotels" : kind === "FLIGHT" ? "flights" : "transport";

  return (
    <div className="overflow-hidden rounded-xl border border-plum-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-plum-100 bg-plum-50/60 px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-plum-800">
          <Icon className="h-4 w-4" aria-hidden /> Pick from our {noun}
        </p>
        {alreadyFilled && (
          <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-plum-700 hover:underline">
            Hide
          </button>
        )}
      </div>

      <div className="space-y-3 p-3.5">
        {kind === "HOTEL" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Filter label="Hotel or city">
              <input className={inputClass} placeholder="Any — e.g. Voco or Makkah" value={city} onChange={(e) => setCity(e.target.value)} />
            </Filter>
            <Filter label="Check-in">
              <input type="date" className={inputClass} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </Filter>
            <Filter label="Check-out">
              <input type="date" className={inputClass} min={checkIn || undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </Filter>
          </div>
        ) : kind === "TRANSPORT" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Filter label="From">
              <input className={inputClass} placeholder="Any — e.g. Jeddah airport" value={fromPlace} onChange={(e) => setFromPlace(e.target.value)} />
            </Filter>
            <Filter label="To">
              <input className={inputClass} placeholder="Any — e.g. Makkah" value={toPlace} onChange={(e) => setToPlace(e.target.value)} />
            </Filter>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Filter label="From (code)">
              <input className={inputClass} maxLength={3} placeholder="Any, e.g. BOM" value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} />
            </Filter>
            <Filter label="To (code)">
              <input className={inputClass} maxLength={3} placeholder="Any, e.g. JED" value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} />
            </Filter>
            <Filter label="On or after">
              <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Filter>
          </div>
        )}

        {hotelDatesBad && <p className="text-sm text-red-600">Check-out must be after check-in.</p>}
        {query.isFetching && (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Spinner /> Searching…
          </p>
        )}
        {!query.isFetching && !hotelDatesBad && query.data?.length === 0 && (
          <p className="rounded-lg bg-surface px-3 py-2.5 text-sm text-ink-500">
            Nothing in our inventory matches. Clear a filter to see more, or close this and type the {kind === "HOTEL" ? "hotel" : kind === "FLIGHT" ? "flight" : "vehicle"} by hand below.
          </p>
        )}

        {kind === "HOTEL" ? (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {rooms.data?.map((r) => (
              <li key={r.stay.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">
                    {r.hotel.name} <span className="font-normal text-ink-500">· {r.roomType.name}</span>
                  </p>
                  <p className="text-xs text-ink-500">
                    {r.hotel.city} · {MEAL_PLAN_LABELS[r.roomType.mealPlan]} · {r.stay.available} room{r.stay.available === 1 ? "" : "s"} left
                  </p>
                  <p className="text-xs text-ink-500">
                    Available {formatDate(r.stay.startDate)} – {formatDate(r.stay.endDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink-900">{formatINR(nights ? r.price * nights : r.price)}</p>
                    <p className="text-xs text-ink-500">{nights ? `${nights} night${nights > 1 ? "s" : ""} · ` : ""}{formatINR(r.price)}/night</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onPick({ hotel: r.hotel.name, city: r.hotel.city, roomType: r.roomType.name, ratePeriodId: r.stay.id, checkIn: checkIn || attrs.checkIn, checkOut: checkOut || attrs.checkOut }, r.price * (nights ?? 1));
                      setOpen(false);
                    }}
                  >
                    Use this
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : kind === "TRANSPORT" ? (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {transport.data?.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                    {t.fromPlace} <ArrowRight className="h-3.5 w-3.5 text-ink-500" aria-hidden /> {t.toPlace}
                  </p>
                  <p className="text-xs text-ink-500">
                    {t.vehicleType} · {t.seats} seats
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink-900">{formatINR(t.price)}</p>
                    <p className="text-xs text-ink-500">per vehicle</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onPick({ vehicle: t.vehicleType, from: t.fromPlace, to: t.toPlace }, t.price);
                      setOpen(false);
                    }}
                  >
                    Use this
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {flights.data?.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                    {f.origin} <ArrowRight className="h-3.5 w-3.5 text-ink-500" aria-hidden /> {f.destination}
                    <span className="font-normal text-ink-500">· {f.airline} {f.flightNumber}</span>
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatDateTime(f.departureAt)} · {f.available} seat{f.available === 1 ? "" : "s"} left
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink-900">{formatINR(f.price)}</p>
                    <p className="text-xs text-ink-500">per seat</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onPick({ airline: `${f.airline} ${f.flightNumber}`, from: f.origin, to: f.destination, departureDate: istDate(f.departureAt), flightSeatBlockId: f.id }, f.price);
                      setOpen(false);
                    }}
                  >
                    Use this
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
