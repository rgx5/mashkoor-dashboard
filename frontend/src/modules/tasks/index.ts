import { ListTodo } from "lucide-react";
import type { AppModule } from "@/core/modules/types";

export { TasksPanel } from "./TasksPanel";
export { TaskDialog } from "./TaskDialog";

/** M03 · Tasks — follow-up list for staff. */
export const tasksModule: AppModule = {
  id: "tasks",
  admin: {
    nav: [{ label: "Tasks", to: "tasks", icon: ListTodo, can: ["read", "Task"], feature: "tasks", group: "CRM" }],
    routes: [{ path: "tasks", lazy: async () => ({ Component: (await import("./admin/TasksPage")).TasksPage }) }],
  },
};
