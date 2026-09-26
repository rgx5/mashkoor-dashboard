import { LayoutDashboard, Wallet } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { formatINR } from "@/core/format";
import { useAbility } from "@/core/rbac/ability";
import { BrandName } from "@/core/ui/BrandName";
import { cn } from "@/core/ui/cn";
import { useWalletSummary } from "@/modules/wallet";
import { UserMenu } from "../shared/UserMenu";
import { b2bNav } from "./registry";

export function B2BLayout() {
  const ability = useAbility("b2b");
  const items = b2bNav.filter((item) => !item.can || ability.can(item.can[0], item.can[1]));
  const { data: wallet } = useWalletSummary("b2b");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 bg-plum-900 text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandName tone="onDark" size="sm" />
            <p className="hidden text-[11px] font-bold tracking-wider text-gold-300 uppercase sm:block">Partner Portal</p>
          </div>
          <span className="ml-auto hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-plum-100 md:inline-flex">
            <Wallet className="h-4 w-4 text-gold-300" aria-hidden /> Balance {wallet ? formatINR(wallet.balance) : "—"}
          </span>
          <UserMenu portal="b2b" invert />
        </div>
        <nav aria-label="Partner" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          <NavLink to="/b2b" end className={tabClass}>
            <LayoutDashboard className="h-4 w-4" aria-hidden /> Dashboard
          </NavLink>
          {items.map((item) => (
            <NavLink key={item.to} to={`/b2b/${item.to}`} className={tabClass}>
              <item.icon className="h-4 w-4" aria-hidden /> {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition",
    isActive ? "border-gold-400 text-white" : "border-transparent text-plum-200 hover:text-white",
  );
