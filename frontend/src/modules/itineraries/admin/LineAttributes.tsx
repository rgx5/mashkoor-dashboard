import { addDays, BASE_CURRENCY, daysBetweenInclusive, describeLine, LINE_MEAL_PLANS, LINE_PAX_TYPES, mealDays, nightsBetween, QUOTE_ROOM_TYPES, stayNights, type ItineraryLine, type ItineraryLineAttrs, type ProductType } from "@mashkoor/shared";
import { SelectField, TextField } from "@/core/ui/form";
import { InventoryPicker } from "./InventoryPicker";

const QUANTITY_MEANS: Partial<Record<ItineraryLine["kind"], string>> = {
  FLIGHT: "Quantity = number of passengers of this type. Add a separate line for children and infants.",
  HOTEL: "Quantity = number of rooms.",
  MEALS: "Quantity = number of people.",
  TRANSPORT: "Quantity = number of vehicles.",
  VISA: "Quantity = number of visas.",
};

/**
 * The fields a line needs for its type — sector and dates for an air ticket, room type and stay for a hotel, a plan for meals,
 * a vehicle for transport — and a preview of the text they produce on the quotation. "Other" lines stay free text.
 */
export function LineAttributes({ line, disabled, productType = "HOLIDAY", onChange }: { line: ItineraryLine; disabled: boolean; productType?: ProductType; onChange: (changes: Partial<ItineraryLine>) => void }) {
  const kind = line.kind ?? "OTHER";
  const a: ItineraryLineAttrs = line.attrs ?? {};
  if (kind === "OTHER") return null;

  const set = (change: Partial<ItineraryLineAttrs>) => {
    const attrs = { ...a, ...change };
    onChange({ attrs, ...describeLine(kind, attrs) });
  };
  /** A hotel or flight picked from inventory: fill the fields in and take the price (in rupees) from the pricing rules. */
  const pick = (change: Partial<ItineraryLineAttrs>, unitPrice: number) => {
    const attrs = { ...a, ...change, nights: nightsBetween(change.checkIn, change.checkOut) ?? a.nights, perUnit: false };
    onChange({ attrs, ...describeLine(kind, attrs), unitPrice, currency: BASE_CURRENCY, foreignAmount: null, fxRate: null });
  };
  const text = (key: keyof ItineraryLineAttrs, label: string, placeholder?: string, list?: string) => (
    <TextField label={label} placeholder={placeholder} list={list} disabled={disabled} value={(a[key] as string | undefined) ?? ""} onChange={(e) => set({ [key]: e.target.value })} />
  );
  const date = (key: keyof ItineraryLineAttrs, label: string) => <TextField label={label} type="date" disabled={disabled} value={(a[key] as string | undefined) ?? ""} onChange={(e) => set({ [key]: e.target.value })} />;
  const pax = (label = "People") => <TextField label={label} type="number" min={1} disabled={disabled} value={a.pax ?? ""} onChange={(e) => set({ pax: e.target.value === "" ? null : Number(e.target.value) })} />;
  const num = (value: string) => (value === "" ? null : Math.max(0, Math.floor(Number(value))) || null);

  // Dates and lengths stay in step: type the check-in and the nights and the check-out follows, or set both dates and the nights follow.
  const stayIn = (checkIn: string) => set({ checkIn, ...(a.nights && checkIn ? { checkOut: addDays(checkIn, a.nights) } : {}) });
  const stayNightsTo = (nights: number | null) => set({ nights, ...(a.checkIn && nights ? { checkOut: addDays(a.checkIn, nights) } : {}) });
  const stayOut = (checkOut: string) => set({ checkOut, nights: nightsBetween(a.checkIn, checkOut) ?? a.nights });
  const mealsFrom = (checkIn: string) => set({ checkIn, ...(a.days && checkIn ? { checkOut: addDays(checkIn, a.days - 1) } : {}) });
  const mealsDaysTo = (days: number | null) => set({ days, ...(a.checkIn && days ? { checkOut: addDays(a.checkIn, days - 1) } : {}) });
  const mealsTo = (checkOut: string) => set({ checkOut, days: daysBetweenInclusive(a.checkIn, checkOut) ?? a.days });

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-surface p-3">
      {(kind === "HOTEL" || kind === "FLIGHT" || kind === "TRANSPORT") && <InventoryPicker kind={kind} attrs={a} productType={productType} disabled={disabled} onPick={pick} />}
      <div className="grid gap-3 sm:grid-cols-3">
        {kind === "FLIGHT" && (
          <>
            <SelectField label="Passenger" disabled={disabled} value={a.paxType || "Adult"} onChange={(e) => set({ paxType: e.target.value })}>
              {LINE_PAX_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </SelectField>
            {text("airline", "Airline", "e.g. Gulf Airlines")}
            {date("departureDate", "Departure date")}
            {text("from", "From", "e.g. Mumbai")}
            {text("to", "To", "e.g. Jeddah")}
            {text("via", "Via", "Optional, e.g. Bahrain")}
            <label className="flex items-center gap-2 text-sm font-medium text-ink-700 sm:col-span-3">
              <input type="checkbox" className="h-4 w-4 accent-plum-600" disabled={disabled} checked={Boolean(a.returnTrip)} onChange={(e) => set({ returnTrip: e.target.checked })} />
              Return trip
            </label>
            {a.returnTrip && (
              <>
                {date("returnDate", "Return date")}
                {text("returnFrom", "Return from", a.to ? `${a.to} (as outbound)` : "")}
                {text("returnTo", "Return to", a.from ? `${a.from} (as outbound)` : "")}
                {text("returnVia", "Return via", "Optional")}
              </>
            )}
          </>
        )}

        {kind === "HOTEL" && (
          <>
            {text("hotel", "Hotel", "e.g. Voco")}
            {text("city", "City", "e.g. Makkah")}
            <TextField label="Room type" placeholder="e.g. Triple" list="room-types" disabled={disabled} value={a.roomType ?? ""} onChange={(e) => set({ roomType: e.target.value })} />
            <datalist id="room-types">
              {QUOTE_ROOM_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <TextField label="Check-in" type="date" disabled={disabled} value={a.checkIn ?? ""} onChange={(e) => stayIn(e.target.value)} />
            <TextField label="Nights" type="number" min={1} disabled={disabled} value={stayNights(a) ?? ""} onChange={(e) => stayNightsTo(num(e.target.value))} />
            <TextField label="Check-out" type="date" min={a.checkIn || undefined} disabled={disabled} value={a.checkOut ?? ""} onChange={(e) => stayOut(e.target.value)} />
            {pax()}
          </>
        )}

        {kind === "MEALS" && (
          <>
            <SelectField label="Meal plan" disabled={disabled} value={a.mealPlan ?? ""} onChange={(e) => set({ mealPlan: e.target.value })}>
              <option value="">Choose…</option>
              {LINE_MEAL_PLANS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </SelectField>
            {text("provider", "Hotel / provider", "Optional")}
            {pax()}
            <TextField label="From" type="date" disabled={disabled} value={a.checkIn ?? ""} onChange={(e) => mealsFrom(e.target.value)} />
            <TextField label="Total days" type="number" min={1} hint="Both dates counted" disabled={disabled} value={mealDays(a) ?? ""} onChange={(e) => mealsDaysTo(num(e.target.value))} />
            <TextField label="To" type="date" min={a.checkIn || undefined} disabled={disabled} value={a.checkOut ?? ""} onChange={(e) => mealsTo(e.target.value)} />
          </>
        )}

        {kind === "TRANSPORT" && (
          <>
            {text("vehicle", "Vehicle", "e.g. Hyundai H1")}
            {text("from", "From", "e.g. Jeddah airport")}
            {text("to", "To", "e.g. Makkah")}
            {date("date", "Date")}
            {pax()}
          </>
        )}

        {kind === "VISA" && (
          <>
            {text("visaType", "Visa type", "e.g. Umrah visa", "visa-types")}
            <datalist id="visa-types">
              <option value="Umrah visa" />
              <option value="Hajj visa" />
              <option value="Tourist visa" />
              <option value="Transit visa" />
            </datalist>
          </>
        )}
      </div>

      <TextField label="Extra note" hint="Optional, printed under the line" disabled={disabled} value={a.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />

      <div className="rounded-lg border border-line bg-white px-3 py-2">
        <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Printed on the quotation</p>
        <p className="mt-0.5 text-sm font-semibold text-ink-900">{line.description || "—"}</p>
        {line.detail && <p className="text-xs whitespace-pre-line text-ink-500">{line.detail}</p>}
      </div>
      {QUANTITY_MEANS[kind] && <p className="text-xs text-ink-500">{QUANTITY_MEANS[kind]}</p>}
    </div>
  );
}
