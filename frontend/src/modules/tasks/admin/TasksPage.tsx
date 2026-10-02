import { Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useAbility } from "@/core/rbac/ability";
import { Button } from "@/core/ui/Button";
import { inputClass } from "@/core/ui/form";
import { Card, PageHeader } from "@/core/ui/layout";
import { Tabs } from "@/core/ui/misc";
import { useStaffOptions } from "@/modules/users";
import { useTasks, type TaskFilters } from "../api";
import { TaskDialog } from "../TaskDialog";
import { TaskList } from "../TaskList";

type DueTab = NonNullable<TaskFilters["due"]> | "done";

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const ability = useAbility("admin");
  const tab = (params.get("due") ?? "today") as DueTab;
  const assignee = params.get("assignee") ?? "me";
  const { data: staff = [] } = useStaffOptions();

  const { data, isLoading } = useTasks({
    due: tab === "done" ? "all" : tab,
    status: tab === "done" ? "DONE" : "OPEN",
    assignee,
  });

  const set = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    });

  return (
    <>
      <PageHeader title="Tasks" description="Follow-ups due today, overdue and coming up." />
      <Card>
        <div className="flex flex-col gap-3 px-4 pt-3 sm:flex-row sm:items-end sm:justify-between">
          <Tabs<DueTab>
            value={tab}
            onChange={(v) => set("due", v)}
            className="border-b-0"
            tabs={[
              { value: "overdue", label: "Overdue", count: data?.counts.overdue },
              { value: "today", label: "Today", count: data?.counts.today },
              { value: "upcoming", label: "Upcoming", count: data?.counts.upcoming },
              { value: "done", label: "Completed" },
            ]}
          />
          <div className="flex items-center gap-2 pb-2">
            {ability.can("manage", "Task") && (
              <select aria-label="Assignee" value={assignee} onChange={(e) => set("assignee", e.target.value)} className={`${inputClass} sm:w-56`}>
                <option value="me">My tasks</option>
                <option value="all">Everyone</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New task
            </Button>
          </div>
        </div>
        <div className="border-t border-line px-4">
          <TaskList tasks={data?.data} loading={isLoading} emptyText={tab === "overdue" ? "Nothing overdue — nice work" : "No tasks here"} />
        </div>
      </Card>
      <TaskDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
