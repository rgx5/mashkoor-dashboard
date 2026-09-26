import { MOCK_CHECKOUT_METHODS, type CheckoutOrder, type PublicPaymentLink } from "@mashkoor/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, Landmark, Lock, ShieldAlert, Smartphone, XCircle } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { publicApi } from "@/core/api/client";
import { errorMessage } from "@/core/api/errors";
import { formatDateTime, formatINR } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { Spinner } from "@/core/ui/Spinner";
import { BrandName } from "@/core/ui/BrandName";

type Method = (typeof MOCK_CHECKOUT_METHODS)[number];
const METHODS: Record<Method, { label: string; hint: string; icon: typeof CreditCard }> = {
  UPI: { label: "UPI", hint: "Pay with any UPI app", icon: Smartphone },
  CARD: { label: "Card", hint: "Debit or credit card", icon: CreditCard },
  NETBANKING: { label: "Net banking", hint: "Your bank's website", icon: Landmark },
};

function Shell({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-surface px-4 py-8">
      <BrandName size="lg" />
      <main className="mt-6 w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-sm">{children}</main>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-500">
        <Lock className="h-3.5 w-3.5" aria-hidden /> Secure payment{company ? ` to ${company}` : ""}
      </p>
    </div>
  );
}

/** `/pay/:token` — the customer's payment page. Test mode plays the gateway; the server records the payment from a signed webhook. */
export function PaymentLinkPage() {
  const { token = "" } = useParams();
  const client = useQueryClient();
  const { data: link, isLoading, error } = useQuery({ queryKey: ["public", "pay", token], queryFn: () => publicApi.get<PublicPaymentLink>(`/pay/${token}`), retry: false });
  const [method, setMethod] = useState<Method>("UPI");
  const [busy, setBusy] = useState<"SUCCESS" | "FAILURE" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (isLoading)
    return (
      <Shell>
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Shell>
    );
  if (error || !link)
    return (
      <Shell>
        <div className="py-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-red-500" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">This link isn't available</h1>
          <p className="mt-1 text-sm text-ink-500">{errorMessage(error, "It may have been mistyped or removed. Please contact your travel consultant.")}</p>
        </div>
      </Shell>
    );

  const pay = async (outcome: "SUCCESS" | "FAILURE") => {
    setBusy(outcome);
    setFailure(null);
    try {
      const order = await publicApi.post<CheckoutOrder>(`/pay/${token}/checkout`);
      await publicApi.post<PublicPaymentLink>(`/pay/${token}/mock-complete`, { orderId: order.orderId, method, outcome });
      if (outcome === "FAILURE") setFailure("The payment didn't go through and you haven't been charged. You can try again.");
      await client.invalidateQueries({ queryKey: ["public", "pay", token] });
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const summary = (
    <div className="rounded-xl bg-surface p-4 text-center">
      <p className="text-xs tracking-wide text-ink-500 uppercase">Amount to pay</p>
      <p className="mt-1 font-display text-3xl font-semibold text-plum-700">{formatINR(link.amount)}</p>
      <p className="mt-2 text-sm text-ink-700">
        {link.description || "Your trip"} · <span className="font-semibold">{link.bookingRef}</span>
      </p>
      <p className="text-xs text-ink-500">For {link.customerName}</p>
    </div>
  );

  if (link.status === "PAID")
    return (
      <Shell company={link.company.name}>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold">Payment received</h1>
          <p className="mt-1 text-sm text-ink-500">Thank you, {link.customerName.split(" ")[0]}. A receipt has been emailed to you.</p>
        </div>
        <div className="mt-5">{summary}</div>
        {link.receiptNo && <p className="mt-4 text-center text-sm text-ink-700">Receipt no. <span className="font-semibold">{link.receiptNo}</span></p>}
      </Shell>
    );

  if (link.status !== "ACTIVE")
    return (
      <Shell company={link.company.name}>
        <div className="text-center">
          <XCircle className="mx-auto h-12 w-12 text-ink-500" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">This payment link is {link.status === "EXPIRED" ? "no longer valid" : "cancelled"}</h1>
          <p className="mt-1 text-sm text-ink-500">Please contact {link.company.name}{link.company.phone ? ` on ${link.company.phone}` : ""} for a new link.</p>
        </div>
      </Shell>
    );

  return (
    <Shell company={link.company.name}>
      <h1 className="mb-4 text-lg font-semibold">Complete your payment</h1>
      {summary}

      <div role="radiogroup" aria-label="Payment method" className="mt-5 space-y-2">
        {MOCK_CHECKOUT_METHODS.map((m) => {
          const { label, hint, icon: Icon } = METHODS[m];
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition", method === m ? "border-plum-500 bg-plum-50 ring-1 ring-plum-500" : "border-line hover:bg-surface")}
            >
              <Icon className="h-5 w-5 text-plum-600" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-ink-500">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {failure && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{failure}</p>}

      <Button size="lg" className="mt-5 w-full" onClick={() => void pay("SUCCESS")} loading={busy === "SUCCESS"} disabled={busy !== null}>
        Pay {formatINR(link.amount)}
      </Button>
      <button type="button" onClick={() => void pay("FAILURE")} disabled={busy !== null} className="mt-2 w-full text-center text-xs text-ink-500 underline-offset-2 hover:underline">
        Simulate a failed payment
      </button>

      <div className="mt-5 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-700">
        <strong>Test mode.</strong> No real money moves. A live payment gateway will replace this screen.
      </div>
      <p className="mt-3 text-center text-xs text-ink-500">Link valid until {formatDateTime(link.expiresAt)}</p>
    </Shell>
  );
}
