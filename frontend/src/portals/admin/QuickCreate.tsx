import { Inbox, ListTodo, Luggage, Plus, Target, Users, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAbility } from "@/core/rbac/ability";
import { NewEnquiryDialog } from "@/modules/enquiries";

interface Item {
  label: string;
  hint: string;
  icon: LucideIcon;
  can: readonly [string, string];
  /** Opens a page… */
  to?: string;
  /** …or a popup, without leaving the page you are on. */
  popup?: "enquiry";
}

const ITEMS: Item[] = [
  { label: "Enquiry", hint: "A call, walk-in or message", popup: "enquiry", icon: Inbox, can: ["create", "Enquiry"] },
  { label: "Lead", hint: "A customer whose requirements you have", to: "/admin/leads?new=1", icon: Target, can: ["create", "Lead"] },
  { label: "Customer", hint: "Add a traveller record", to: "/admin/customers?new=1", icon: Users, can: ["create", "Customer"] },
  { label: "Booking", hint: "Flights, hotels, packages", to: "/admin/bookings?new=1", icon: Luggage, can: ["create", "Booking"] },
  { label: "Task", hint: "A follow-up", to: "/admin/tasks?new=1", icon: ListTodo, can: ["create", "Task"] },
];

/** Global "+ New" — start any common record from anywhere. */
export function QuickCreate() {
  const navigate = useNavigate();
  const ability = useAbility("admin");
  const [open, setOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = ITEMS.filter((i) => ability.can(i.can[0], i.can[1]));

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-plum-600 px-3.5 text-sm font-semibold text-white shadow-xs transition hover:bg-plum-700 focus-visible:ring-3 focus-visible:ring-plum-200 focus-visible:outline-none"
      >
        <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">New</span>
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-white p-1.5 shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (item.popup === "enquiry") setEnquiryOpen(true);
                else if (item.to) navigate(item.to);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-plum-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-plum-50 text-plum-600">
                <item.icon className="h-4 w-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-900">New {item.label.toLowerCase()}</span>
                <span className="block text-xs text-ink-500">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <NewEnquiryDialog open={enquiryOpen} onClose={() => setEnquiryOpen(false)} />
    </div>
  );
}
