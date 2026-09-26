import type { Task } from "@mashkoor/shared";
import { CalendarClock, CheckCircle2, Circle, ListTodo } from "lucide-react";
import { Link } from "react-router";
import { withToast } from "@/core/api/errors";
import { formatDateTime, isOverdue } from "@/core/format";
import { cn } from "@/core/ui/cn";
import { Badge, EmptyState } from "@/core/ui/layout";
import { Spinner } from "@/core/ui/Spinner";
import { useUpdateTask } from "./api";

const priorityTone = { HOT: "red", WARM: "amber", COLD: "neutral" } as const;

export function TaskList({ tasks, loading, showContext = true, emptyText = "No tasks here" }: { tasks: Task[] | undefined; loading?: boolean; showContext?: boolean; emptyText?: string }) {
  const update = useUpdateTask();

  if (loading && !tasks)
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  if (!tasks?.length) return <EmptyState icon={ListTodo} title={emptyText} />;

  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => {
        const done = task.status === "DONE";
        const overdue = !done && isOverdue(task.dueAt);
        return (
          <li key={task.id} className="flex items-start gap-3 py-3">
            <button
              type="button"
              aria-label={done ? "Reopen task" : "Mark task done"}
              onClick={() => withToast(update.mutateAsync({ id: task.id, status: done ? "OPEN" : "DONE" }), done ? "Task reopened" : "Task completed")}
              className="mt-0.5 text-ink-300 transition hover:text-plum-600"
            >
              {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> : <Circle className="h-5 w-5" aria-hidden />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", done ? "text-ink-300 line-through" : "text-ink-900")}>{task.title}</p>
              {task.description && <p className="mt-0.5 text-sm text-ink-500">{task.description}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-red-600")}>
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {overdue ? "Overdue · " : ""}
                  {formatDateTime(task.dueAt)}
                </span>
                <span>{task.assignee.name}</span>
                {showContext && task.lead && (
                  <Link to={`/admin/leads/${task.lead.id}`} className="font-semibold text-plum-700 hover:underline">
                    {task.lead.refNo} · {task.lead.contactName}
                  </Link>
                )}
                {showContext && !task.lead && task.customer && (
                  <Link to={`/admin/customers/${task.customer.id}`} className="font-semibold text-plum-700 hover:underline">
                    {task.customer.fullName}
                  </Link>
                )}
              </p>
            </div>
            <Badge tone={priorityTone[task.priority]}>{task.priority.toLowerCase()}</Badge>
          </li>
        );
      })}
    </ul>
  );
}
