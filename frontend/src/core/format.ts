/** Indian formatting everywhere: ₹ with lakh grouping, DD MMM YYYY, IST. */

const TZ = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ });
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2026-10-12" (date-only) or ISO timestamp → "12 Oct 2026" */
export const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  // Anything that is not a real date (a stray "null", a bad value from an import) shows as a dash instead of crashing the page.
  return Number.isNaN(date.getTime()) ? "—" : dateFmt.format(date);
};

export const formatDateTime = (value: string | null | undefined) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? dateTimeFmt.format(date) : "—";
};

export const formatINR = (value: number | null | undefined) => (value == null ? "—" : inr.format(value));

export function timeAgo(value: string | null | undefined) {
  if (!value) return "—";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(Math.round(seconds), "second");
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), "day");
  return formatDate(value);
}

export const isOverdue = (value: string | null | undefined) => Boolean(value && new Date(value).getTime() < Date.now());

/** `<input type="datetime-local">` value ↔ ISO with IST offset. */
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
};
export const fromLocalInput = (local: string) => (local ? `${local}:00+05:30` : null);

export const travellersLabel = (adults: number, children: number, infants: number) =>
  [adults && `${adults} adult${adults > 1 ? "s" : ""}`, children && `${children} child${children > 1 ? "ren" : ""}`, infants && `${infants} infant${infants > 1 ? "s" : ""}`]
    .filter(Boolean)
    .join(", ") || "—";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
