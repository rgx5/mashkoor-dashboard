import { ChevronDown, LayoutDashboard, ListTodo, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useSession } from "@/core/auth/session-store";
import { useAbility } from "@/core/rbac/ability";
import { BrandName } from "@/core/ui/BrandName";
import { cn } from "@/core/ui/cn";
import { PageMetaProvider, usePageMeta } from "@/core/ui/layout";
import { useAdminDashboard } from "@/modules/dashboard";
import { UserMenu } from "../shared/UserMenu";
import { GlobalSearch } from "./GlobalSearch";
import { QuickCreate } from "./QuickCreate";
import { adminNav } from "./registry";

const STORAGE_KEY = "mk.sidebar.openGroup";
const RAIL_KEY = "mk.sidebar.rail";

/** The one sidebar group the user last had open. Best-effort: storage can be blocked, so it never throws. */
function loadOpenGroup(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Whether the user last collapsed the whole sidebar down to an icon rail. */
function loadRailCollapsed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

export function AdminLayout() {
  return (
    <PageMetaProvider>
      <AdminShell />
    </PageMetaProvider>
  );
}

function AdminShell() {
  const pageMeta = usePageMeta();
  const [open, setOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(loadRailCollapsed);
  const [railHovered, setRailHovered] = useState(false);
  const { pathname } = useLocation();
  const ability = useAbility("admin");
  const { data: summary } = useAdminDashboard();
  const { user } = useSession("admin");
  // Super admins see everything; everyone else only the areas switched on for them (the dashboard home is always there).
  const hasFeature = (feature?: string) => !feature || user?.role === "SUPER_ADMIN" || Boolean(user?.features?.includes(feature));
  const items = adminNav.filter((item) => hasFeature(item.feature) && (!item.can || ability.can(item.can[0], item.can[1])));
  const groups = [...new Set(items.map((i) => i.group ?? "Main"))];
  const dueTasks = summary ? summary.tasks.dueToday + summary.tasks.overdue : 0;

  // Whichever group holds the current page — that's the one that should be open, so you never lose your place.
  const activeGroup = groups.find(
    (g) => g !== "Main" && items.some((i) => (i.group ?? "Main") === g && (pathname === `/admin/${i.to}` || pathname.startsWith(`/admin/${i.to}/`))),
  );
  // Accordion: at most one group open at a time. Everything starts collapsed unless a page in it is active.
  const [openGroup, setOpenGroup] = useState<string | null>(() => activeGroup ?? loadOpenGroup());

  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);

  const toggle = (group: string) =>
    setOpenGroup((prev) => {
      const next = prev === group ? null : group;
      try {
        if (next) localStorage.setItem(STORAGE_KEY, next);
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* preference just won't persist */
      }
      return next;
    });

  const toggleRail = () =>
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      } catch {
        /* preference just won't persist */
      }
      return next;
    });

  /** Picking a page while the rail is collapsed (or hover-expanded) pins it open, so it doesn't snap shut on you. */
  const expandRailOnClick = () => {
    setOpen(false);
    if (!railCollapsed) return;
    setRailCollapsed(false);
    try {
      localStorage.setItem(RAIL_KEY, "0");
    } catch {
      /* preference just won't persist */
    }
  };

  /** `rail`: the persistent desktop sidebar, which can shrink to icons only. The mobile drawer is always full width. */
  const renderSidebar = (rail: boolean) => (
    <nav aria-label="Admin" className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center gap-2", rail ? "justify-center px-2" : "px-5")}>
        {!rail && (
          <Link to="/admin" onClick={() => setOpen(false)} aria-label="Mashkoor Tourism home" className="mr-auto">
            <BrandName tone="onDark" />
          </Link>
        )}
        <button
          type="button"
          onClick={toggleRail}
          className="hidden rounded-lg p-1.5 text-plum-200 transition hover:bg-white/10 hover:text-white lg:block"
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          title={rail ? "Expand sidebar" : "Collapse sidebar"}
        >
          {rail ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2">
        <NavLink to="/admin" end className={(s) => navClass(s, rail)} onClick={expandRailOnClick} title={rail ? "Dashboard" : undefined}>
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden /> {!rail && "Dashboard"}
        </NavLink>
        {rail
          ? // Collapsed rail: a flat icon list, no group headers — there's no room for them.
            items.map((item) => (
              <NavLink key={item.to} to={`/admin/${item.to}`} className={(s) => navClass(s, rail)} onClick={expandRailOnClick} title={item.label}>
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              </NavLink>
            ))
          : groups.map((group) => {
              const groupItems = items.filter((i) => (i.group ?? "Main") === group);
              const expanded = group === "Main" || openGroup === group;
              return (
                <div key={group}>
                  {group !== "Main" && (
                    <button
                      type="button"
                      onClick={() => toggle(group)}
                      aria-expanded={expanded}
                      className="mt-2.5 flex w-full items-center justify-between rounded-lg px-3 py-1 text-[11px] font-bold tracking-wider text-plum-300 uppercase transition hover:bg-white/5 hover:text-white"
                    >
                      {group}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !expanded && "-rotate-90")} aria-hidden />
                    </button>
                  )}
                  {expanded && (
                    <div className="mt-1 space-y-0.5">
                      {groupItems.map((item) => (
                        <NavLink key={item.to} to={`/admin/${item.to}`} className={(s) => navClass(s, rail)} onClick={expandRailOnClick}>
                          <item.icon className="h-4 w-4 shrink-0" aria-hidden /> {item.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
      </div>
    </nav>
  );

  // While the rail is collapsed, hovering it temporarily unfolds the full sidebar as an overlay — the layout
  // (and the persisted preference) stay collapsed; only the visual, on top of the page, expands.
  const floating = railCollapsed && railHovered;

  return (
    <div className={cn("min-h-dvh transition-[padding]", railCollapsed ? "lg:pl-16" : "lg:pl-56")}>
      <aside
        onMouseEnter={() => railCollapsed && setRailHovered(true)}
        onMouseLeave={() => setRailHovered(false)}
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden bg-plum-950 transition-[width] lg:block",
          railCollapsed ? "w-16" : "w-56",
          floating && "w-56 shadow-2xl",
        )}
      >
        {renderSidebar(railCollapsed && !railHovered)}
      </aside>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "visible" : "invisible")}>
        <div className={cn("absolute inset-0 bg-plum-950/50 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside className={cn("absolute inset-y-0 left-0 w-56 bg-plum-950 transition-transform", open ? "translate-x-0" : "-translate-x-full")}>
          <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-lg p-1.5 text-plum-200 hover:bg-white/10" aria-label="Close menu">
            <X className="h-5 w-5" aria-hidden />
          </button>
          {renderSidebar(false)}
        </aside>
      </div>

      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-700 hover:bg-surface lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link to="/admin" aria-label="Mashkoor Tourism home" className="shrink-0 lg:hidden">
          <BrandName size="sm" />
        </Link>
        {pageMeta && (
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg leading-6 font-semibold text-ink-900">{pageMeta.title}</h1>
            {pageMeta.description && <p className="hidden truncate text-[13px] leading-4 text-ink-500 md:block">{pageMeta.description}</p>}
          </div>
        )}
        <div className={cn("flex items-center gap-2", !pageMeta && "ml-auto")}>
          <GlobalSearch />
          <QuickCreate />
          {hasFeature("tasks") && (
          <Link to="/admin/tasks" className="relative rounded-lg p-2 text-ink-700 hover:bg-surface" aria-label={dueTasks ? `${dueTasks} tasks due` : "Tasks"}>
            <ListTodo className="h-5 w-5" aria-hidden />
            {dueTasks > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{dueTasks}</span>}
          </Link>
          )}
          <UserMenu portal="admin" />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:py-6">
        <Outlet />
      </main>
    </div>
  );
}

const navClass = ({ isActive }: { isActive: boolean }, rail = false) =>
  cn(
    "flex items-center gap-3 rounded-lg py-1.5 text-sm font-medium transition",
    rail ? "justify-center px-2" : "px-3",
    isActive ? "bg-plum-700 text-white" : "text-plum-100 hover:bg-white/5 hover:text-white",
  );
