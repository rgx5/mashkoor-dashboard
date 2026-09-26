import { Body, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { taskInputSchema, taskListQuerySchema, taskUpdateSchema, type TaskData, type TaskListQuery, type TaskUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { TasksService } from "../domain/tasks.service";

/** `/api/v1/admin/tasks` */
@PortalController("admin", "tasks")
export class AdminTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @CheckAbility("read", "Task")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(taskListQuerySchema)) query: TaskListQuery) {
    return this.tasks.list(actor, query);
  }

  @Post()
  @CheckAbility("create", "Task")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(taskInputSchema)) body: TaskData) {
    return this.tasks.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Task")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(taskUpdateSchema)) body: TaskUpdateData) {
    return this.tasks.update(actor, id, body);
  }
}
