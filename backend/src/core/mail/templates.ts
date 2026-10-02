import type { MailMessage } from "./mail.types";

type Built = Pick<MailMessage, "subject" | "text" | "html" | "event">;

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inr = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
const day = (value: string | Date | null | undefined) =>
  value ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "—";
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The shared look for every email: plum header with the wordmark, a body, an optional button, a contact footer. */
export function emailLayout(input: { heading: string; paragraphs: string[]; cta?: { label: string; url: string }; facts?: [string, string][] }): { html: string; text: string } {
  const facts = input.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid #eadfe6;border-radius:8px;border-collapse:separate">${input.facts
        .map(([k, v]) => `<tr><td style="padding:9px 14px;color:#6b5a66;font-size:13px;border-bottom:1px solid #f3eaf0">${esc(k)}</td><td style="padding:9px 14px;font-size:14px;font-weight:600;color:#231920;text-align:right;border-bottom:1px solid #f3eaf0">${esc(v)}</td></tr>`)
        .join("")}</table>`
    : "";
  const button = input.cta
    ? `<p style="margin:24px 0"><a href="${esc(input.cta.url)}" style="background:#7a1f5c;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;display:inline-block">${esc(input.cta.label)}</a></p><p style="font-size:12px;color:#8a7885;word-break:break-all">Or paste this link into your browser:<br>${esc(input.cta.url)}</p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f3f6;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#3a0b2c;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:600">Mashkoor <span style="color:#f3c34a">Tourism</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px;color:#231920">${esc(input.heading)}</h1>
${input.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3d3038">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
${facts}${button}
</td></tr>
<tr><td style="padding:16px 28px;background:#faf7f9;color:#8a7885;font-size:12px;line-height:1.5">Mashkoor International Tourism · G-Sector, N/2 Line, Shop No. 09, Cheeta Camp, Trombay, Mumbai – 400088<br>+91 90827 10830 · info@mashkoor.co.in</td></tr>
</table></td></tr></table></body></html>`;

  const text = [input.heading, "", ...input.paragraphs, ...(input.facts ?? []).map(([k, v]) => `${k}: ${v}`), ...(input.cta ? ["", `${input.cta.label}: ${input.cta.url}`] : []), "", "— Mashkoor International Tourism"].join("\n");
  return { html, text };
}

function build(event: string, subject: string, layout: Parameters<typeof emailLayout>[0]): Built {
  const { html, text } = emailLayout(layout);
  return { event, subject, html, text };
}

/** One builder per business event. Each returns the subject/body; the caller adds the recipient. */
export const emails = {
  test: () => build("test", "Test email from Mashkoor Tourism", { heading: "Email is working", paragraphs: ["This is a test message. If you can read it, outgoing email is set up correctly."] }),

  customerWelcome: (p: { customerName: string; loginUrl: string; email: string }) =>
    build("customer.welcome", "Your Mashkoor trip portal is ready", {
      heading: "Your trips, all in one place",
      paragraphs: [
        `Assalamu Alaikum ${firstName(p.customerName)},`,
        "You can now follow your trips online: see your quotations, pay any balance, download your tickets, visa and vouchers, and read updates from our team.",
        `There is no password to remember. Open the portal, enter ${p.email}, and we'll email you a 6-digit code each time you sign in.`,
      ],
      cta: { label: "Open my trips", url: p.loginUrl },
    }),

  tripUpdate: (p: { recipientName: string; bookingRef: string; message: string; url: string }) =>
    build("trip.update", `Update on your trip ${p.bookingRef}`, {
      heading: "An update from our team",
      paragraphs: [`Assalamu Alaikum ${firstName(p.recipientName)},`, p.message, `This is about booking ${p.bookingRef}.`],
      cta: { label: "View my trip", url: p.url },
    }),

  documentShared: (p: { recipientName: string; bookingRef: string; documentName: string; url: string }) =>
    build("trip.document", `New document for ${p.bookingRef}: ${p.documentName}`, {
      heading: "A document is ready for you",
      paragraphs: [`Assalamu Alaikum ${firstName(p.recipientName)},`, `We've added "${p.documentName}" to booking ${p.bookingRef}. You can download it from your trip page.`],
      cta: { label: "Open my trip", url: p.url },
    }),

  customerCancelRequestToStaff: (p: { customerName: string; bookingRef: string; reason: string; url: string }) =>
    build("customer.cancel_requested", `Cancellation requested: ${p.bookingRef}`, {
      heading: "A customer wants to cancel",
      paragraphs: [`${p.customerName} asked to cancel booking ${p.bookingRef}. Reason: ${p.reason}`, "Nothing has been cancelled or refunded yet — review the booking and get in touch with them."],
      cta: { label: "Review booking", url: p.url },
    }),

  itineraryChangesToStaff: (p: { customerName: string; title: string; message: string; url: string }) =>
    build("itinerary.changes_requested", `Changes requested: ${p.title}`, {
      heading: "A customer wants changes to their plan",
      paragraphs: [`${p.customerName} reviewed "${p.title}" and asked for changes:`, p.message],
      cta: { label: "Open quotation", url: p.url },
    }),

  reviewToStaff: (p: { customerName: string; bookingRef: string; rating: number; comment: string; url: string }) =>
    build("customer.review", `New ${p.rating}-star review from ${p.customerName}`, {
      heading: "A customer reviewed their trip",
      paragraphs: [`${p.customerName} rated booking ${p.bookingRef} ${p.rating} out of 5:`, p.comment, "It's saved as a draft testimonial. Approve it in Testimonials if you'd like it on the website."],
      cta: { label: "Open testimonials", url: p.url },
    }),

  paymentReceipt: (p: { customerName: string; receiptNo: string; amount: number; bookingRef: string; method: string; balanceDue: number }) =>
    build("payment.receipt", `Payment received — ${p.receiptNo}`, {
      heading: "Thank you, we've received your payment",
      paragraphs: [`Assalamu Alaikum ${firstName(p.customerName)},`, `We have received ${inr(p.amount)} towards booking ${p.bookingRef}.`, p.balanceDue > 0 ? `The balance still to pay is ${inr(p.balanceDue)}.` : "Your booking is now paid in full. Jazakallah khair."],
      facts: [["Receipt no.", p.receiptNo], ["Booking", p.bookingRef], ["Paid via", p.method], ["Amount", inr(p.amount)], ["Balance due", inr(p.balanceDue)]],
    }),

  paymentLink: (p: { customerName: string; amount: number; bookingRef: string; url: string; expiresAt: Date | string }) =>
    build("payment.link", `Payment request — ${inr(p.amount)} for ${p.bookingRef}`, {
      heading: "Your secure payment link",
      paragraphs: [`Assalamu Alaikum ${firstName(p.customerName)},`, `Please use the button below to pay ${inr(p.amount)} for booking ${p.bookingRef}. The link is valid until ${day(p.expiresAt)}.`],
      cta: { label: `Pay ${inr(p.amount)}`, url: p.url },
    }),

  bookingConfirmed: (p: { customerName: string; bookingRef: string; destination: string | null; travelFrom: string | null; totalSell: number; balanceDue: number }) =>
    build("booking.confirmed", `Booking confirmed — ${p.bookingRef}`, {
      heading: "Your booking is confirmed",
      paragraphs: [`Assalamu Alaikum ${firstName(p.customerName)},`, `Alhamdulillah, booking ${p.bookingRef}${p.destination ? ` for ${p.destination}` : ""} is confirmed. Our team will share your travel documents as they are ready.`],
      facts: [["Booking", p.bookingRef], ["Departure", day(p.travelFrom)], ["Total", inr(p.totalSell)], ["Balance due", inr(p.balanceDue)]],
    }),

  bookingCancelled: (p: { customerName: string; bookingRef: string; reason: string | null }) =>
    build("booking.cancelled", `Booking cancelled — ${p.bookingRef}`, {
      heading: "Your booking has been cancelled",
      paragraphs: [`Assalamu Alaikum ${firstName(p.customerName)},`, `Booking ${p.bookingRef} has been cancelled.${p.reason ? ` Reason: ${p.reason}.` : ""} If you have questions about refunds, please contact us.`],
    }),

  itineraryShared: (p: { customerName: string; title: string; url: string; validUntil: Date | string | null; agentName: string | null }) =>
    build("itinerary.shared", `Your trip plan: ${p.title}`, {
      heading: "Your quotation is ready",
      paragraphs: [`Assalamu Alaikum ${firstName(p.customerName)},`, `${p.agentName ?? "Our team"} has prepared "${p.title}" for you. Open it to see the day-by-day plan and pricing, and accept it when you're happy.${p.validUntil ? ` This proposal is valid until ${day(p.validUntil)}.` : ""}`],
      cta: { label: "View quotation", url: p.url },
    }),

  partnerApproved: (p: { contactName: string; companyName: string; loginUrl: string }) =>
    build("partner.approved", "Your Mashkoor partner account is approved", {
      heading: "Welcome aboard",
      paragraphs: [`Assalamu Alaikum ${firstName(p.contactName)},`, `${p.companyName} has been approved as a Mashkoor partner. Our team will send your sign-in invitation shortly.`],
      cta: { label: "Partner portal", url: p.loginUrl },
    }),

  walletTopUp: (p: { contactName: string; amount: number; balance: number; note: string | null }) =>
    build("wallet.topup", `Wallet credited — ${inr(p.amount)}`, {
      heading: "Your wallet has been topped up",
      paragraphs: [`Assalamu Alaikum ${firstName(p.contactName)},`, `${inr(p.amount)} has been added to your Mashkoor wallet.${p.note ? ` (${p.note})` : ""}`],
      facts: [["Credited", inr(p.amount)], ["New balance", inr(p.balance)]],
    }),

  walletLow: (p: { contactName: string; companyName: string; available: number }) =>
    build("wallet.low", "Your Mashkoor wallet balance is running low", {
      heading: "Low wallet balance",
      paragraphs: [`Assalamu Alaikum ${firstName(p.contactName)},`, `${p.companyName} has ${inr(p.available)} available to spend (balance plus credit). Please top up to keep bookings flowing.`],
    }),

  balanceReminder: (p: { customerName: string; bookingRef: string; travelFrom: string | null; balanceDue: number; daysToGo: number; payUrl: string | null }) =>
    build("booking.balance_reminder", `Balance due for ${p.bookingRef} — travel in ${p.daysToGo} days`, {
      heading: "A gentle reminder about your balance",
      paragraphs: [`Assalamu Alaikum ${firstName(p.customerName)},`, `Your trip departs in ${p.daysToGo} days (${day(p.travelFrom)}). ${inr(p.balanceDue)} is still due on booking ${p.bookingRef}. Please clear it so we can issue your documents on time.`],
      ...(p.payUrl ? { cta: { label: `Pay ${inr(p.balanceDue)}`, url: p.payUrl } } : {}),
    }),

  bookingSubmittedToStaff: (p: { partnerName: string; bookingRef: string; total: number; url: string }) =>
    build("b2b.booking_submitted", `Approval needed: ${p.bookingRef} from ${p.partnerName}`, {
      heading: "A partner booking is waiting for approval",
      paragraphs: [`${p.partnerName} submitted booking ${p.bookingRef} worth ${inr(p.total)}. Review and confirm it to debit their wallet.`],
      cta: { label: "Open booking", url: p.url },
    }),

  /** A visitor booked a fixed departure directly on the website and is on their way to pay (or has just paid). */
  websiteBookingToStaff: (p: { customerName: string; bookingRef: string; packageTitle: string; departureDate: string | null; travelerCount: number; amountDue: number; url: string }) =>
    build("website.booking_created", `New website booking: ${p.bookingRef} — ${p.customerName}`, {
      heading: "A customer booked directly on the website",
      paragraphs: [`${p.customerName} booked ${p.travelerCount} traveller(s) on "${p.packageTitle}"${p.departureDate ? ` departing ${day(p.departureDate)}` : ""}. The seat is held pending ${inr(p.amountDue)} payment.`],
      cta: { label: "Open booking", url: p.url },
    }),

  cancelRequestToStaff: (p: { partnerName: string; bookingRef: string; reason: string; url: string }) =>
    build("b2b.cancel_requested", `Cancellation requested: ${p.bookingRef}`, {
      heading: "A partner wants to cancel a booking",
      paragraphs: [`${p.partnerName} asked to cancel ${p.bookingRef}. Reason: ${p.reason}`],
      cta: { label: "Review booking", url: p.url },
    }),

  itineraryAcceptedToStaff: (p: { title: string; customerName: string | null; url: string }) =>
    build("itinerary.accepted", `Quotation accepted: ${p.title}`, {
      heading: "A customer accepted a quotation",
      paragraphs: [`${p.customerName ?? "The customer"} accepted "${p.title}". You can now convert it into a booking.`],
      cta: { label: "Open quotation", url: p.url },
    }),

  onlinePaymentToStaff: (p: { customerName: string; bookingRef: string; amount: number; receiptNo: string; url: string }) =>
    build("payment.online_received", `Online payment: ${inr(p.amount)} on ${p.bookingRef}`, {
      heading: "An online payment came in",
      paragraphs: [`${p.customerName} paid ${inr(p.amount)} on booking ${p.bookingRef} (receipt ${p.receiptNo}).`],
      cta: { label: "Open booking", url: p.url },
    }),

  staffDigest: (p: { name: string; items: { label: string; count: number }[]; url: string }) =>
    build("digest.daily", `Your day: ${p.items.reduce((s, i) => s + i.count, 0)} things need attention`, {
      heading: `Good morning, ${firstName(p.name)}`,
      paragraphs: ["Here is what needs your attention today."],
      facts: p.items.map((i): [string, string] => [i.label, String(i.count)]),
      cta: { label: "Open dashboard", url: p.url },
    }),
};
