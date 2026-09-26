/**
 * Normalises a phone number to E.164. Numbers without a country code are treated as Indian.
 * Returns null when the input can't be a valid number.
 *
 *   "98765 43210"     → "+919876543210"
 *   "098765-43210"    → "+919876543210"
 *   "91 9876543210"   → "+919876543210"
 *   "+966 50 123 4567"→ "+966501234567"
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);

  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;

  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits[2]!)) return `+${digits}`;
  return null;
}

/** "+919876543210" → "+91 98765 43210" for display. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** wa.me link for a stored E.164 number. */
export const whatsappUrl = (e164: string, text?: string) =>
  `https://wa.me/${e164.replace("+", "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
