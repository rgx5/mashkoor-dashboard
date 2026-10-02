import { ROLE_LABELS, type Role, type StaffAccessMatrix, type StaffAccessRow, type StaffFeature } from "@mashkoor/shared";
import { Check, Info, ShieldCheck } from "lucide-react";
import { Fragment } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/core/api/errors";
import { cn } from "@/core/ui/cn";
import { Card, PageHeader } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useSetStaffAccess, useStaffAccess } from "../api";

/** Clearly on (solid plum with a tick) or clearly off (white with a grey outline) — never two similar greys. */
function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus-visible:ring-3 focus-visible:ring-plum-200 focus-visible:outline-none",
        on ? "border-plum-600 bg-plum-600" : "border-ink-300 bg-white",
      )}
    >
      <span className={cn("flex h-[18px] w-[18px] items-center justify-center rounded-full shadow-sm transition", on ? "translate-x-[22px] bg-white text-plum-600" : "translate-x-[2px] bg-ink-300")}>
        {on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
      </span>
    </button>
  );
}

/**
 * The access matrix: one column per staff member, one row per dashboard area, so it fits the screen. Everyone starts with the
 * dashboard home only. A cell for an area the person's role can't use is crossed out, because turning it on would change nothing.
 */
export function FeatureAccessPage() {
  const { data, isLoading, error } = useStaffAccess();
  const save = useSetStaffAccess();

  const set = (row: StaffAccessRow, features: StaffFeature[]) => save.mutate({ id: row.id, features }, { onError: (e) => toast.error(errorMessage(e)) });
  const toggle = (row: StaffAccessRow, feature: StaffFeature, on: boolean) => set(row, on ? [...row.features, feature] : row.features.filter((f) => f !== feature));

  return (
    <>
      <PageHeader title="Feature access" description="Choose which parts of the dashboard each staff member can use" />

      <p className="mb-4 flex items-start gap-2 rounded-xl border border-plum-100 bg-plum-50/50 px-4 py-3 text-sm text-ink-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-plum-700" aria-hidden />
        <span>
          Everyone starts with the dashboard home only. Switch on the areas each person needs; what they can do inside an area still depends on their role. The change applies to their next request, and their menu updates when they next open or reload the app. Super admins always have everything.
        </span>
      </p>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {error && <p className="py-10 text-center text-sm text-red-600">{errorMessage(error)}</p>}
      {data && <Matrix data={data} onToggle={toggle} onSet={set} />}
    </>
  );
}

function Matrix({ data, onToggle, onSet }: { data: StaffAccessMatrix; onToggle: (row: StaffAccessRow, feature: StaffFeature, on: boolean) => void; onSet: (row: StaffAccessRow, features: StaffFeature[]) => void }) {
  const groups: string[] = [];
  for (const f of data.features) if (!groups.includes(f.group)) groups.push(f.group);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th scope="col" className="sticky left-0 z-10 w-64 min-w-56 bg-surface px-4 py-3 align-bottom text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Dashboard area
              </th>
              {data.staff.map((row) => {
                const allOn = row.available.every((f) => row.features.includes(f));
                return (
                  <th key={row.id} scope="col" className="min-w-32 border-l border-line px-3 py-3 text-center align-top">
                    <p className="font-semibold text-ink-900">{row.name}</p>
                    <p className="text-xs font-normal text-ink-500">{ROLE_LABELS[row.role as Role] ?? row.role}</p>
                    {row.fullAccess ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-plum-700">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Full access
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-normal">
                        <button type="button" className="font-semibold text-plum-700 hover:underline disabled:text-ink-300 disabled:no-underline" disabled={allOn} onClick={() => onSet(row, [...row.available])}>
                          All
                        </button>
                        <span className="mx-1.5 text-ink-300" aria-hidden>
                          ·
                        </span>
                        <button type="button" className="font-semibold text-plum-700 hover:underline disabled:text-ink-300 disabled:no-underline" disabled={row.features.length === 0} onClick={() => onSet(row, [])}>
                          None
                        </button>
                      </p>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr className="border-y border-line bg-plum-50/60">
                  <th scope="colgroup" colSpan={data.staff.length + 1} className="sticky left-0 px-4 py-1.5 text-left text-[11px] font-bold tracking-wide text-plum-700 uppercase">
                    {group}
                  </th>
                </tr>
                {data.features
                  .filter((f) => f.group === group)
                  .map((f) => (
                    <tr key={f.key} className="border-b border-line last:border-b-0 hover:bg-plum-50/30">
                      <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-normal">
                        <p className="font-semibold text-ink-900">{f.label}</p>
                        <p className="text-xs text-ink-500">{f.description}</p>
                      </th>
                      {data.staff.map((row) => {
                        const usable = row.fullAccess || row.available.includes(f.key);
                        return (
                          <td key={row.id} className={cn("border-l border-line px-3 py-3 text-center", !usable && "bg-surface/60")}>
                            {row.fullAccess ? (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-plum-50 text-plum-700" title="Super admins always have this">
                                <Check className="h-4 w-4" aria-hidden />
                              </span>
                            ) : usable ? (
                              <span className="inline-flex">
                                <Switch on={row.features.includes(f.key)} label={`${f.label} for ${row.name}`} onChange={(on) => onToggle(row, f.key, on)} />
                              </span>
                            ) : (
                              <span className="text-ink-300" title={`Not part of the ${ROLE_LABELS[row.role as Role] ?? row.role} role`}>
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {data.staff.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-500">No staff yet.</p>}
    </Card>
  );
}
