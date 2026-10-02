import { ROLE_LABELS, type Role } from "@mashkoor/shared";
import { forwardRef, type ComponentProps } from "react";
import { inputClass } from "@/core/ui/form";
import { cn } from "@/core/ui/cn";
import { useStaffOptions } from "./api";

/** Select of active staff. Empty value means "Unassigned". */
export const StaffSelect = forwardRef<HTMLSelectElement, ComponentProps<"select"> & { emptyLabel?: string; roles?: Role[] }>(function StaffSelect({ emptyLabel = "Unassigned", roles, className, ...props }, ref) {
  const { data: all = [] } = useStaffOptions();
  const data = roles ? all.filter((u) => roles.includes(u.role)) : all;
  return (
    <select ref={ref} className={cn(inputClass, className)} {...props}>
      <option value="">{emptyLabel}</option>
      {data.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} · {ROLE_LABELS[u.role]}
        </option>
      ))}
    </select>
  );
});
