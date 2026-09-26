import { BOOKING_ITEM_TYPE_LABELS, BOOKING_STATUS_LABELS, PRODUCT_TYPE_LABELS, type BookingDetail, type BookingPaymentSummary } from "@mashkoor/shared";
import { formatDate, formatINR } from "@/core/format";

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Opens a print-ready booking confirmation in a new window (use the browser's "Save as PDF"). Customer-facing:
 * it shows what the customer pays, never cost or margin.
 */
export function openBookingVoucher(booking: BookingDetail, payments?: BookingPaymentSummary) {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return false;

  const travellers = booking.travelers.map((t) => `${t.firstName} ${t.lastName ?? ""}`.trim());
  const rows = booking.items
    .map((i) => `<tr><td>${esc(BOOKING_ITEM_TYPE_LABELS[i.type])}</td><td>${esc(i.description)}</td><td class="n">${i.quantity}</td><td class="n">${esc(formatINR(i.sellPrice * i.quantity))}</td></tr>`)
    .join("");
  const paid = payments ? payments.totalCollected - payments.totalRefunded : null;

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(booking.refNo)} — Booking confirmation</title>
<style>
  *{box-sizing:border-box} body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1e1320;margin:0;padding:32px;max-width:760px;margin:auto}
  h1{font-size:22px;margin:0} .brand{font-size:20px;font-weight:700;color:#4a1d5c} .brand span{color:#94650a}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #4a1d5c;padding-bottom:12px;margin-bottom:20px}
  .muted{color:#6b5f6c;font-size:12px} dl{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;margin:0 0 20px} dt{color:#6b5f6c} dd{margin:0;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-bottom:12px} th,td{padding:8px;border-bottom:1px solid #e8e3ea;text-align:left;vertical-align:top} th{font-size:11px;text-transform:uppercase;color:#6b5f6c} .n{text-align:right;white-space:nowrap}
  .tot{margin-left:auto;width:260px} .tot div{display:flex;justify-content:space-between;padding:3px 0} .tot .big{font-weight:700;font-size:16px;border-top:2px solid #1e1320;margin-top:4px;padding-top:6px}
  .foot{margin-top:28px;font-size:11px;color:#6b5f6c;border-top:1px solid #e8e3ea;padding-top:10px} @media print{body{padding:0} button{display:none}}
</style></head><body>
<div class="head"><div><div class="brand">Mashkoor <span>Tourism</span></div><div class="muted">Booking confirmation</div></div>
<div style="text-align:right"><h1>${esc(booking.refNo)}</h1><div class="muted">${esc(BOOKING_STATUS_LABELS[booking.status])}</div></div></div>
<dl>
  <dt>Guest</dt><dd>${esc(booking.customer.fullName)}</dd>
  <dt>Trip</dt><dd>${esc(PRODUCT_TYPE_LABELS[booking.productType])}${booking.destination ? " · " + esc(booking.destination) : ""}</dd>
  <dt>Travel dates</dt><dd>${booking.travelFrom ? esc(formatDate(booking.travelFrom)) + " → " + esc(formatDate(booking.travelTo)) : "To be confirmed"}</dd>
  <dt>Travellers</dt><dd>${travellers.length ? esc(travellers.join(", ")) : "—"}</dd>
</dl>
<table><thead><tr><th>Type</th><th>Details</th><th class="n">Qty</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot">
  ${booking.discount > 0 ? `<div><span>Discount</span><span>−${esc(formatINR(booking.discount))}</span></div>` : ""}
  <div class="big"><span>Total</span><span>${esc(formatINR(booking.totalSell))}</span></div>
  ${paid !== null ? `<div><span>Paid</span><span>${esc(formatINR(paid))}</span></div><div><span>Balance due</span><span>${esc(formatINR(payments!.balanceDue))}</span></div>` : ""}
</div>
<div class="foot">This is a computer-generated confirmation and needs no signature. Please carry a copy along with your travel documents.</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})</script>
</body></html>`);
  win.document.close();
  return true;
}
