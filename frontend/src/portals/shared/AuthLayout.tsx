import type { ReactNode } from "react";
import { BrandName } from "@/core/ui/BrandName";

const portalCopy = {
  admin: { eyebrow: "Mashkoor Tourism · Control Center", tagline: "Leads, bookings, partners and payments — in one place." },
  b2b: { eyebrow: "Mashkoor Partner Portal", tagline: "Book Hajj, Umrah and holidays for your customers at partner rates." },
  b2c: { eyebrow: "My Mashkoor Trips", tagline: "Your bookings, quotations and travel documents." },
} as const;

export function AuthLayout({ portal, title, subtitle, children }: { portal: keyof typeof portalCopy; title: string; subtitle?: string; children: ReactNode }) {
  const copy = portalCopy[portal];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-plum-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-plum-600/40 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-gold-400/15 blur-3xl" aria-hidden />
        <div className="relative">
          <BrandName tone="onDark" size="lg" />
        </div>
        <div className="relative max-w-md">
          <p className="text-xs font-bold tracking-[0.18em] text-gold-300 uppercase">{copy.eyebrow}</p>
          <p className="mt-4 font-display text-4xl leading-tight font-semibold">{copy.tagline}</p>
        </div>
        <p className="relative text-sm text-plum-300">© {new Date().getFullYear()} Mashkoor International Tourism</p>
      </aside>

      <main className="flex items-center justify-center bg-white px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandName size="md" />
            <p className="mt-2 text-xs font-bold tracking-[0.16em] text-plum-600 uppercase">{copy.eyebrow}</p>
          </div>
          <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
