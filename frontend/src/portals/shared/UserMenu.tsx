import { ROLE_LABELS, type Portal } from "@mashkoor/shared";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { signOut } from "@/core/auth/actions";
import { useSession } from "@/core/auth/session-store";
import { cn } from "@/core/ui/cn";

export function UserMenu({ portal, invert }: { portal: Portal; invert?: boolean }) {
  const { user } = useSession(portal);
  const navigate = useNavigate();
  if (!user) return null;
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <details className="group relative">
      <summary className={cn("flex cursor-pointer list-none items-center gap-3 rounded-lg p-1.5 pr-2", invert ? "hover:bg-white/10" : "hover:bg-surface")}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-plum-950">{initials}</span>
        <span className="hidden text-left sm:block">
          <span className={cn("block text-sm leading-tight font-semibold", invert ? "text-white" : "text-ink-900")}>{user.name}</span>
          <span className={cn("block text-xs", invert ? "text-plum-300" : "text-ink-500")}>{ROLE_LABELS[user.role]}</span>
        </span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-white p-1.5 shadow-xl">
        <p className="truncate px-3 py-2 text-xs text-ink-500">{user.email}</p>
        <button
          type="button"
          onClick={async () => {
            await signOut(portal);
            navigate(`/${portal}/login`, { replace: true });
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-plum-50"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </div>
    </details>
  );
}
