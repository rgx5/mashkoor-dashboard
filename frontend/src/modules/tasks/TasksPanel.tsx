import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/core/ui/Button";
import { Card } from "@/core/ui/layout";
import { useTasks } from "./api";
import { TaskDialog } from "./TaskDialog";
import { TaskList } from "./TaskList";

/** Open tasks for one lead or customer, embedded in their detail page. */
export function TasksPanel({ leadId, customerId, defaultTitle }: { leadId?: string; customerId?: string; defaultTitle?: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useTasks({ leadId, customerId, status: "OPEN", assignee: "all", due: "all" });

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Follow-ups</h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Task
        </Button>
      </div>
      <TaskList tasks={data?.data} loading={isLoading} showContext={false} emptyText="No open follow-ups" />
      <TaskDialog open={open} onClose={() => setOpen(false)} leadId={leadId} customerId={customerId} defaultTitle={defaultTitle} />
    </Card>
  );
}
