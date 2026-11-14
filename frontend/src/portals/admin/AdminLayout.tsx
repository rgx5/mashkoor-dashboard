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

/** Fixed sidebar order. Anything not listed here (e.g. Reports) falls in after, in its original order. */
const GROUP_ORDER = ["CRM", "Inventory", "Operations", "Accounts", "Partners", "Catalog", "Administration"];

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
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const { pathname } = useLocation();
  const ability = useAbility("admin");
  const { data: summary } = useAdminDashboard();
  const { user } = useSession("admin");
  // Super admins see everything; everyone else only the areas switched on for them (the dashboard home is always there).
  const hasFeature = (feature?: string) => !feature || user?.role === "SUPER_ADMIN" || Boolean(user?.features?.includes(feature));
  const items = adminNav.filter((item) => hasFeature(item.feature) && (!item.can || ability.can(item.can[0], item.can[1])));
  const groups = [...new Set(items.map((i) => i.group ?? "Main"))].sort((a, b) => {
    if (a === "Main" || b === "Main") return a === b ? 0 : a === "Main" ? -1 : 1;
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    return (ai === -1 ? GROUP_ORDER.length : ai) - (bi === -1 ? GROUP_ORDER.length : bi);
  });
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

  const closeOverlays = () => {
    setOpen(false);
    setHoveredGroup(null);
  };

  const mainItems = items.filter((i) => (i.group ?? "Main") === "Main");
  const namedGroups = groups.filter((g) => g !== "Main");

  /** The expanded sidebar: full-width links, grouped under collapsible headers. Used both docked and in the mobile drawer. */
  const renderSidebar = () => (
    <nav aria-label="Admin" className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-5">
        <Link to="/admin" onClick={() => setOpen(false)} aria-label="Mashkoor Tourism home" className="mr-auto">
          <BrandName tone="onDark" />
        </Link>
        <button
          type="button"
          onClick={toggleRail}
          className="hidden rounded-lg p-1.5 text-plum-200 transition hover:bg-white/10 hover:text-white lg:block"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2">
        <NavLink to="/admin" end className={(s) => navClass(s)} onClick={() => setOpen(false)}>
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden /> Dashboard
        </NavLink>
        {groups.map((group) => {
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
                    <NavLink key={item.to} to={`/admin/${item.to}`} className={(s) => navClass(s)} onClick={() => setOpen(false)}>
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

  /** Collapsed state, panel 1: a fixed icon-only rail. Ungrouped pages link directly; each named group collapses to one tile. */
  const renderRail = () => (
    <nav aria-label="Admin" className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-center px-2">
        <button
          type="button"
          onClick={toggleRail}
          className="rounded-lg p-1.5 text-plum-200 transition hover:bg-white/10 hover:text-white"
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-2.5 py-3">
        <NavLink to="/admin" end className={(s) => navClass(s, true)} onClick={closeOverlays} onMouseEnter={() => setHoveredGroup(null)} title="Dashboard">
          <LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden />
        </NavLink>
        {mainItems.map((item) => (
          <NavLink
            key={item.to}
            to={`/admin/${item.to}`}
            className={(s) => navClass(s, true)}
            onClick={closeOverlays}
            onMouseEnter={() => setHoveredGroup(null)}
            title={item.label}
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden />
          </NavLink>
        ))}
        {namedGroups.map((group) => {
          const groupItems = items.filter((i) => (i.group ?? "Main") === group);
          const GroupIcon = groupItems[0]?.icon ?? LayoutDashboard;
          const active = activeGroup === group || hoveredGroup === group;
          return (
            <button
              key={group}
              type="button"
              onMouseEnter={() => setHoveredGroup(group)}
              onFocus={() => setHoveredGroup(group)}
              onClick={() => setHoveredGroup(group)}
              aria-haspopup="true"
              aria-expanded={hoveredGroup === group}
              title={group}
              className={cn(
                "flex w-full items-center justify-center rounded-lg px-2 py-2.5 transition",
                active ? "bg-plum-700 text-white" : "text-plum-100 hover:bg-white/5 hover:text-white",
              )}
            >
              <GroupIcon className="h-5 w-5 shrink-0" aria-hidden />
            </button>
          );
        })}
      </div>
    </nav>
  );

  /** Collapsed state, panel 2: a full-height flyout beside the rail, listing the hovered group's pages. */
  const renderFlyout = (group: string) => {
    const groupItems = items.filter((i) => (i.group ?? "Main") === group);
    return (
      <nav aria-label={group} className="flex h-full flex-col">
        <div className="flex h-16 items-center px-4">
          <span className="text-[11px] font-bold tracking-wider text-plum-300 uppercase">{group}</span>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-2.5 py-3">
          {groupItems.map((item) => (
            <NavLink key={item.to} to={`/admin/${item.to}`} className={(s) => navClass(s)} onClick={closeOverlays}>
              <item.icon className="h-5 w-5 shrink-0" aria-hidden /> {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    );
  };

  return (
    <div className={cn("min-h-dvh transition-[padding]", railCollapsed ? "lg:pl-16" : "lg:pl-56")}>
      {railCollapsed ? (
        <div className="fixed inset-y-0 left-0 z-50 hidden lg:flex" onMouseLeave={() => setHoveredGroup(null)}>
          <aside className="h-full w-16 bg-plum-950">{renderRail()}</aside>
          {hoveredGroup && <aside className="h-full w-56 border-l border-white/10 bg-plum-950 shadow-2xl">{renderFlyout(hoveredGroup)}</aside>}
        </div>
      ) : (
        <aside className="fixed inset-y-0 left-0 z-50 hidden w-56 bg-plum-950 lg:block">{renderSidebar()}</aside>
      )}

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "visible" : "invisible")}>
        <div className={cn("absolute inset-0 bg-plum-950/50 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside className={cn("absolute inset-y-0 left-0 w-56 bg-plum-950 transition-transform", open ? "translate-x-0" : "-translate-x-full")}>
          <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-lg p-1.5 text-plum-200 hover:bg-white/10" aria-label="Close menu">
            <X className="h-5 w-5" aria-hidden />
          </button>
          {renderSidebar()}
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
