import { Module } from "@nestjs/common";
import { AdminTasksController } from "./admin/admin-tasks.controller";
import { TasksService } from "./domain/tasks.service";

/** M03 · Tasks (follow-ups). */
@Module({
  controllers: [AdminTasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
