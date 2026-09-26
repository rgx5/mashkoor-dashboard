import { Home } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { BrandName } from "@/core/ui/BrandName";
import { cn } from "@/core/ui/cn";
import { UserMenu } from "../shared/UserMenu";
import { b2cNav } from "./registry";

/** Mobile-first customer portal: top bar + bottom navigation on phones. */
export function B2CLayout() {
  const items = [{ label: "Home", to: "", icon: Home }, ...b2cNav];

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-4">
          <div className="flex items-center gap-3">
            <BrandName size="sm" />
            <span className="hidden text-[11px] font-bold tracking-wider text-plum-600 uppercase sm:block">My Trips</span>
          </div>
          <nav aria-label="My account" className="hidden gap-1 sm:flex">
            {items.map((item) => (
              <NavLink key={item.to} to={`/b2c/${item.to}`} end={item.to === ""} className={({ isActive }) => cn("rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-plum-50 text-plum-700" : "text-ink-700 hover:bg-surface")}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <UserMenu portal="b2c" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>

      <nav aria-label="My account" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white sm:hidden">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={`/b2c/${item.to}`}
            end={item.to === ""}
            className={({ isActive }) => cn("flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold", isActive ? "text-plum-700" : "text-ink-500")}
          >
            <item.icon className="h-5 w-5" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
