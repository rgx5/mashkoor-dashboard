import type { Portal } from "@mashkoor/shared";
import type { LucideIcon } from "lucide-react";
import { useSession } from "@/core/auth/session-store";
import { Card, PageHeader } from "@/core/ui/layout";

export interface ComingTile {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
}

/** Phase 0 home: greets the user and shows which modules arrive in which phase. Replaced by M14 dashboards. */
export function PortalHome({ portal, subtitle, tiles }: { portal: Portal; subtitle: string; tiles: ComingTile[] }) {
  const { user } = useSession(portal);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={`${greeting}, ${user?.name.split(" ")[0] ?? ""}`} description={subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ icon: Icon, title, description, phase }) => (
          <Card key={title} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-plum-50 text-plum-600">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-500">{phase}</span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-ink-900">{title}</h2>
            <p className="mt-1 text-sm text-ink-500">{description}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
