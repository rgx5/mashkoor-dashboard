import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { AdminUsersController } from "./admin/admin-users.controller";
import { UsersService } from "./domain/users.service";

/** M00 · Users. Admin slice now; the B2B slice (agency users) is added in Phase 3. */
@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
