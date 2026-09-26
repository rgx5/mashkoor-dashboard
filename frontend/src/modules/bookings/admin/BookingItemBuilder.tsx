import { BOOKING_ITEM_TYPE_LABELS, BOOKING_ITEM_TYPES, MEAL_PLAN_LABELS, type BookingItemData } from "@mashkoor/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { formatDate, formatDateTime, formatINR } from "@/core/format";
import { usePackages } from "@/modules/catalog";
import { useFlightAvailability, useRoomAvailability } from "@/modules/inventory";
import { Button } from "@/core/ui/Button";
import { inputClass, SelectField, TextField } from "@/core/ui/form";
import { Card } from "@/core/ui/layout";

/** Adds one line to a new booking: picks real inventory for flights/hotels, or a manual line for everything else. */
export function BookingItemBuilder({ onAdd }: { onAdd: (item: BookingItemData & { label: string }) => void }) {
  const [type, setType] = useState<(typeof BOOKING_ITEM_TYPES)[number]>("HOTEL");

  return (
    <Card className="space-y-3 p-4">
      <SelectField label="Item type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        {BOOKING_ITEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {BOOKING_ITEM_TYPE_LABELS[t]}
          </option>
        ))}
      </SelectField>
      {(type === "HOTEL" || type === "FLIGHT") && (
        <p className="rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-700">
          {type === "HOTEL" ? "Search for a room to add — the price and reservation come from live hotel inventory." : "Search for a seat block to add — the price and reservation come from live flight inventory."} Nothing
          in inventory that matches? Use <span className="font-semibold">Package</span> or <span className="font-semibold">Other</span> below to add a priced line by hand instead.
        </p>
      )}
      {type === "HOTEL" && <HotelItemForm onAdd={onAdd} />}
      {type === "FLIGHT" && <FlightItemForm onAdd={onAdd} />}
      {type === "PACKAGE" && <PackageItemForm onAdd={onAdd} />}
      {(type === "VISA" || type === "TICKETING" || type === "OTHER") && <ManualItemForm type={type} onAdd={onAdd} />}
    </Card>
  );
}

function HotelItemForm({ onAdd }: { onAdd: (item: BookingItemData & { label: string }) => void }) {
  const [city, setCity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quantity, setQuantity] = useState(1);
  const search = from && to;
  // Rates are per room per night; a booking line is per room for the whole stay.
  const nights = from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000)) : 0;
  const { data: results, isFetching } = useRoomAvailability({ kind: "HOTEL", city: city || undefined, from, to }, Boolean(search));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <TextField label="Check-in" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="Check-out" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {!search && <p className="text-sm text-ink-500">Enter check-in and check-out dates to search. City is optional — leave it blank to search everywhere.</p>}
      {isFetching && <p className="text-sm text-ink-500">Searching…</p>}
      {search && !isFetching && results?.length === 0 && <p className="text-sm text-ink-500">No rooms available for these dates{city ? ` in ${city}` : ""}. Try different dates, clear the city, or add a manual line instead.</p>}
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {results?.map((r) => (
          <div key={r.ratePeriod.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-2.5 text-sm">
            <div>
              <p className="font-semibold">
                {r.hotel.name} · {r.roomType.name}
              </p>
              <p className="text-xs text-ink-500">
                {r.hotel.city} · {MEAL_PLAN_LABELS[r.roomType.mealPlan]} · {r.ratePeriod.available} available · {formatINR(r.ratePeriod.costPrice)}/night{nights > 0 ? ` · ${formatINR(r.ratePeriod.costPrice * nights)} for ${nights} night${nights > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input type="number" min={1} max={r.ratePeriod.available} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={`${inputClass} w-16 py-1`} aria-label="Rooms" />
              <Button
                size="sm"
                onClick={() =>
                  onAdd({
                    type: "HOTEL",
                    description: `${r.hotel.name} · ${r.roomType.name} (${formatDate(from)} – ${formatDate(to)}, ${nights} night${nights === 1 ? "" : "s"})`,
                    ratePeriodId: r.ratePeriod.id,
                    quantity,
                    costPrice: r.ratePeriod.costPrice * Math.max(nights, 1),
                    sellPrice: 0,
                    label: `${r.hotel.name} · ${r.roomType.name} × ${Math.max(nights, 1)}N`,
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlightItemForm({ onAdd }: { onAdd: (item: BookingItemData & { label: string }) => void }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [from, setFrom] = useState("");
  const [quantity, setQuantity] = useState(1);
  const search = origin.length === 3 && destination.length === 3;
  const { data: results, isFetching } = useFlightAvailability({ kind: "FLIGHT", origin, destination, from: from || undefined }, search);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <TextField label="From (IATA)" maxLength={4} value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} />
        <TextField label="To (IATA)" maxLength={4} value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} />
        <TextField label="On/after" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      {!search && <p className="text-sm text-ink-500">Enter both airport codes (e.g. BOM, JED) to search flight inventory.</p>}
      {isFetching && <p className="text-sm text-ink-500">Searching…</p>}
      {search && !isFetching && results?.length === 0 && <p className="text-sm text-ink-500">No seat blocks match. Try a different date, or add a manual line instead.</p>}
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {results?.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-2.5 text-sm">
            <div>
              <p className="font-semibold">
                {f.airline} {f.flightNumber} · {f.origin} → {f.destination}
              </p>
              <p className="text-xs text-ink-500">
                {formatDateTime(f.departureAt)} · {f.available} seats left · {formatINR(f.costPrice)}/seat
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input type="number" min={1} max={f.available} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={`${inputClass} w-16 py-1`} aria-label="Seats" />
              <Button
                size="sm"
                onClick={() =>
                  onAdd({
                    type: "FLIGHT",
                    description: `${f.airline} ${f.flightNumber} · ${f.origin} → ${f.destination} (${formatDateTime(f.departureAt)})`,
                    flightSeatBlockId: f.id,
                    quantity,
                    costPrice: f.costPrice,
                    sellPrice: 0,
                    label: `${f.airline} ${f.flightNumber}`,
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PackageItemForm({ onAdd }: { onAdd: (item: BookingItemData & { label: string }) => void }) {
  const { data } = usePackages({ page: 1, pageSize: 200, published: true });
  const [packageId, setPackageId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const selected = data?.data.find((p) => p.id === packageId);

  return (
    <div className="space-y-3">
      <SelectField label="Package" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
        <option value="">Choose a package…</option>
        {data?.data.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title} {p.fromPrice ? `— from ${formatINR(p.fromPrice)}` : ""}
          </option>
        ))}
      </SelectField>
      <TextField label="Pax" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      <Button
        disabled={!selected}
        onClick={() =>
          selected &&
          onAdd({
            type: "PACKAGE",
            description: selected.title,
            packageId: selected.id,
            quantity,
            costPrice: 0,
            sellPrice: selected.fromPrice ?? 0,
            label: selected.title,
          })
        }
      >
        <Plus className="h-4 w-4" aria-hidden /> Add package
      </Button>
    </div>
  );
}

function ManualItemForm({ type, onAdd }: { type: "VISA" | "TICKETING" | "OTHER"; onAdd: (item: BookingItemData & { label: string }) => void }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [costPrice, setCostPrice] = useState("0");
  const [sellPrice, setSellPrice] = useState("0");

  return (
    <div className="space-y-3">
      <TextField label="Description" required value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === "VISA" ? "e.g. Saudi visa x2" : "Describe this item"} />
      <div className="grid grid-cols-3 gap-2">
        <TextField label="Qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        <TextField label="Cost (₹)" type="number" min={0} value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        <TextField label="Sell (₹)" type="number" min={0} value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
      </div>
      <Button
        disabled={!description.trim()}
        onClick={() => onAdd({ type, description: description.trim(), quantity, costPrice: Number(costPrice), sellPrice: Number(sellPrice), label: description.trim() })}
      >
        <Plus className="h-4 w-4" aria-hidden /> Add item
      </Button>
    </div>
  );
}
