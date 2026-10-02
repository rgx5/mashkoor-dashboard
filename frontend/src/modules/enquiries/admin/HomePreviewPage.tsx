import { MessageCircle, Phone, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/core/ui/Button";
import { cn } from "@/core/ui/cn";
import { inputClass } from "@/core/ui/form";
import { Card } from "@/core/ui/layout";
import { SegmentedControl } from "@/core/ui/misc";

type View = "sales" | "admin" | "accounts";

interface Row {
  id: string;
  name: string;
  phone: string;
  stage: string;
  stageLabel: string;
  waiting: string;
  late?: boolean;
  next: string;
  owner?: string | null;
}

interface ViewData {
  today: { label: string; value: number; warn?: boolean }[];
  stages: { key: string; label: string }[];
  rows: Row[];
  tasks: string[];
  newLabel: string;
}

const SALES_STAGES = [
  { key: "enquiry", label: "Enquiries" },
  { key: "requirements", label: "Requirements" },
  { key: "quotation", label: "Quotation" },
  { key: "payment", label: "Payment" },
  { key: "won", label: "Won" },
];

const SALES: ViewData = {
  today: [
    { label: "To call", value: 3 },
    { label: "Follow-ups due", value: 2, warn: true },
    { label: "Quotes waiting", value: 1 },
    { label: "Awaiting payment", value: 1 },
  ],
  stages: SALES_STAGES,
  rows: [
    { id: "1", name: "Ayesha Khan", phone: "+91 98200 11001", stage: "enquiry", stageLabel: "New enquiry", waiting: "today", next: "Mark contacted" },
    { id: "2", name: "Imran Sheikh", phone: "+91 98200 11002", stage: "enquiry", stageLabel: "Contacted", waiting: "1 day", next: "Convert to lead" },
    { id: "3", name: "Farida Patel", phone: "+91 98200 11003", stage: "enquiry", stageLabel: "New enquiry", waiting: "2 days", late: true, next: "Mark contacted" },
    { id: "4", name: "Demo Customer", phone: "+91 98765 43210", stage: "requirements", stageLabel: "Requirements taken", waiting: "5 days", late: true, next: "Create quotation" },
    { id: "5", name: "Sana Merchant", phone: "+91 98111 22334", stage: "quotation", stageLabel: "Quotation sent", waiting: "2 days", next: "Move to payment" },
    { id: "6", name: "Rohan Gosavi", phone: "+91 89998 65294", stage: "payment", stageLabel: "With accounts", waiting: "5 days", next: "View" },
    { id: "7", name: "Flow Test Customer", phone: "+91 98930 00011", stage: "won", stageLabel: "Won", waiting: "today", next: "View" },
  ],
  tasks: ["Call Farida Patel back", "Send visa checklist to Demo Customer", "Follow up Sana Merchant on quotation"],
  newLabel: "New enquiry",
};

const ADMIN: ViewData = {
  today: [
    { label: "Unassigned enquiries", value: 2, warn: true },
    { label: "Follow-ups overdue", value: 2, warn: true },
    { label: "Needs an accountant", value: 1, warn: true },
    { label: "Payments to verify", value: 0 },
  ],
  stages: SALES_STAGES,
  rows: [
    { id: "1", name: "Ayesha Khan", phone: "+91 98200 11001", stage: "enquiry", stageLabel: "New enquiry", waiting: "today", next: "Open", owner: null },
    { id: "2", name: "Imran Sheikh", phone: "+91 98200 11002", stage: "enquiry", stageLabel: "New enquiry", waiting: "today", next: "Open", owner: null },
    { id: "3", name: "Farida Patel", phone: "+91 98200 11003", stage: "enquiry", stageLabel: "New enquiry", waiting: "2 days", late: true, next: "Open", owner: "Demo Sales Agent" },
    { id: "4", name: "Demo Customer", phone: "+91 98765 43210", stage: "requirements", stageLabel: "Requirements taken", waiting: "11 days", late: true, next: "Open", owner: "Demo Sales Agent" },
    { id: "5", name: "Sana Merchant", phone: "+91 98111 22334", stage: "quotation", stageLabel: "Quotation sent", waiting: "2 days", next: "Open", owner: "Demo Operations" },
    { id: "6", name: "Rohan Gosavi", phone: "+91 89998 65294", stage: "payment", stageLabel: "Awaiting payment", waiting: "5 days", late: true, next: "Open", owner: null },
    { id: "7", name: "Flow Test Customer", phone: "+91 98930 00011", stage: "won", stageLabel: "Won", waiting: "today", next: "Open", owner: "Demo Sales Agent" },
  ],
  tasks: ["Review 1 overdue follow-up", "Approve partner application"],
  newLabel: "New enquiry",
};

const ACCOUNTS: ViewData = {
  today: [
    { label: "To invoice", value: 2, warn: true },
    { label: "Payments to verify", value: 1, warn: true },
    { label: "Part paid", value: 1 },
    { label: "Collected this month", value: 0 },
  ],
  stages: [
    { key: "invoice", label: "To invoice" },
    { key: "unpaid", label: "Invoiced" },
    { key: "part", label: "Part paid" },
    { key: "paid", label: "Paid" },
  ],
  rows: [
    { id: "1", name: "Rohan Gosavi", phone: "+91 89998 65294", stage: "invoice", stageLabel: "Quotation accepted", waiting: "5 days", late: true, next: "Create invoice" },
    { id: "2", name: "Sana Merchant", phone: "+91 98111 22334", stage: "invoice", stageLabel: "Quotation accepted", waiting: "today", next: "Create invoice" },
    { id: "3", name: "Meera Joshi", phone: "+91 98999 88777", stage: "unpaid", stageLabel: "MKV-26-000002 · ₹1,20,000", waiting: "3 days", late: true, next: "Record payment" },
    { id: "4", name: "Karan Mehta", phone: "+91 98222 33445", stage: "part", stageLabel: "MKV-26-000001 · ₹90,000 due", waiting: "6 days", late: true, next: "Record payment" },
    { id: "5", name: "Flow Test Customer", phone: "+91 98930 00011", stage: "paid", stageLabel: "MKV-26-000003 · paid", waiting: "today", next: "View" },
  ],
  tasks: ["Verify UPI payment from Karan Mehta", "Send invoice reminder to Meera Joshi"],
  newLabel: "Record payment",
};

const DATA: Record<View, ViewData> = { sales: SALES, admin: ADMIN, accounts: ACCOUNTS };

/** A look at the proposed home page with sample data only. Nothing here reads or changes real records. */
export function HomePreviewPage() {
  const [view, setView] = useState<View>("sales");
  const [layout, setLayout] = useState<"board" | "list">("board");
  const [stage, setStage] = useState<string | null>(null);
  const data = DATA[view];
  const admin = view === "admin";
  const counts = Object.fromEntries(data.stages.map((s) => [s.key, data.rows.filter((r) => r.stage === s.key).length]));
  const listRows = stage ? data.rows.filter((r) => r.stage === stage) : data.rows;

  const actions = (r: Row, className?: string) => (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button type="button" aria-label={`Call ${r.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-700 hover:bg-plum-50">
        <Phone className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" aria-label={`WhatsApp ${r.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-emerald-600 hover:bg-emerald-50">
        <MessageCircle className="h-4 w-4" aria-hidden />
      </button>
      {!(admin && r.owner === null) && (
        <Button size="sm" variant={r.next === "View" || r.next === "Open" ? "secondary" : "primary"} className="ml-auto">
          {r.next}
        </Button>
      )}
    </div>
  );

  const assign = (r: Row) => (
    <select className={cn(inputClass, "h-8 py-0 text-xs")} defaultValue="" aria-label={`Assign ${r.name}`}>
      <option value="">{r.stage === "payment" ? "Assign accountant…" : "Assign to…"}</option>
      <option>{r.stage === "payment" ? "Demo Accounts" : "Demo Sales Agent"}</option>
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gold-50 px-4 py-2 text-sm text-gold-700">
        <span>Preview with sample data. Nothing here is real or saved.</span>
        <SegmentedControl
          value={view}
          onChange={(v) => {
            setView(v);
            setStage(null);
          }}
          options={[
            { value: "sales", label: "Sales rep" },
            { value: "admin", label: "Super admin" },
            { value: "accounts", label: "Accountant" },
          ]}
        />
      </div>

      {/* Row 1: who am I, and the two controls I use most */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink-900">Good afternoon</h1>
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={layout}
            onChange={(v) => {
              setLayout(v);
              setStage(null);
            }}
            options={[
              { value: "board", label: "Board" },
              { value: "list", label: "List" },
            ]}
          />
          <Button>
            <Plus className="h-4 w-4" aria-hidden /> {data.newLabel}
          </Button>
        </div>
      </div>

      {/* Row 2: today's numbers and today's to-do, side by side in one slim block */}
      <Card className="grid overflow-hidden shadow-xs lg:grid-cols-[1fr_20rem]">
        <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
          {data.today.map((t) => (
            <div key={t.label} className="px-5 py-3.5">
              <p className="text-xs font-semibold text-ink-500">{t.label}</p>
              <p className={cn("mt-0.5 text-2xl font-bold", t.warn && t.value > 0 ? "text-red-600" : "text-ink-900")}>{t.value}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line bg-surface/50 px-4 py-3 lg:border-t-0 lg:border-l">
          <p className="mb-1.5 text-xs font-bold tracking-wide text-ink-500 uppercase">To do today</p>
          <ul className="space-y-1">
            {data.tasks.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm text-ink-700">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-plum-600" aria-label={t} />
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* Row 3: the pipeline */}
      {layout === "board" ? (
        <div className="overflow-x-auto pb-2">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${data.stages.length}, minmax(15rem, 1fr))` }}>
            {data.stages.map((s) => {
              const cards = data.rows.filter((r) => r.stage === s.key);
              return (
                <section key={s.key} aria-label={s.label} className="rounded-xl bg-plum-50/50 p-2.5">
                  <header className="mb-2.5 flex items-center justify-between px-1">
                    <h2 className="text-xs font-bold tracking-wide text-ink-700 uppercase">{s.label}</h2>
                    <span className={cn("rounded-full bg-white px-2 py-0.5 text-xs font-bold", cards.length === 0 ? "text-ink-300" : "text-plum-700")}>{cards.length}</span>
                  </header>
                  <div className="space-y-2">
                    {cards.map((r) => (
                      <Card key={r.id} className="p-3 shadow-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-900">{r.name}</p>
                            <p className="text-xs text-ink-500">{r.phone}</p>
                          </div>
                          <span className={cn("shrink-0 text-xs whitespace-nowrap", r.late ? "font-semibold text-red-600" : "text-ink-500")}>{r.waiting}</span>
                        </div>
                        <p className="mt-2 text-xs text-ink-500">{r.stageLabel}</p>
                        {admin && <div className="mt-2">{r.owner === null ? assign(r) : <p className="text-xs text-ink-700">{r.owner}</p>}</div>}
                        {actions(r, "mt-3 border-t border-line pt-3")}
                      </Card>
                    ))}
                    {cards.length === 0 && <p className="px-1 py-6 text-center text-xs text-ink-300">Nothing here</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Card className="overflow-hidden shadow-xs">
            <div className="flex divide-x divide-line overflow-x-auto">
              <button type="button" onClick={() => setStage(null)} className={cn("min-w-24 px-5 py-3 text-left transition hover:bg-plum-50/60", stage === null && "bg-plum-50")}>
                <span className="block text-xs font-semibold text-ink-500">All</span>
                <span className="text-xl font-bold text-ink-900">{data.rows.length}</span>
              </button>
              {data.stages.map((s) => (
                <button key={s.key} type="button" onClick={() => setStage(stage === s.key ? null : s.key)} className={cn("min-w-28 flex-1 px-5 py-3 text-left transition hover:bg-plum-50/60", stage === s.key && "bg-plum-50 shadow-[inset_0_-3px_0_var(--color-plum-600)]")}>
                  <span className="block text-xs font-semibold text-ink-500">{s.label}</span>
                  <span className={cn("text-xl font-bold", counts[s.key] === 0 ? "text-ink-300" : "text-ink-900")}>{counts[s.key]}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card className="overflow-x-auto shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface/60 text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-3 py-2.5 font-semibold">Stage</th>
                  {admin && <th className="px-3 py-2.5 font-semibold">Assigned to</th>}
                  <th className="px-3 py-2.5 font-semibold">Waiting</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {listRows.map((r) => (
                  <tr key={r.id} className="hover:bg-plum-50/40">
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold text-ink-900">{r.name}</span>
                      <span className="block text-xs text-ink-500">{r.phone}</span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-700">{r.stageLabel}</td>
                    {admin && <td className="px-3 py-2.5">{r.owner === null ? assign(r) : <span className="text-ink-500">{r.owner}</span>}</td>}
                    <td className={cn("px-3 py-2.5 whitespace-nowrap", r.late ? "font-semibold text-red-600" : "text-ink-500")}>{r.waiting}</td>
                    <td className="px-4 py-2.5">{actions(r, "justify-end")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listRows.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-500">Nothing at this stage.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
