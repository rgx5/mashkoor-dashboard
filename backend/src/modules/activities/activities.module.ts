import { Module } from "@nestjs/common";
import { AdminActivitiesController } from "./admin/admin-activities.controller";
import { ActivitiesService } from "./domain/activities.service";

/** M03 · Activities (timeline). */
@Module({
  controllers: [AdminActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
