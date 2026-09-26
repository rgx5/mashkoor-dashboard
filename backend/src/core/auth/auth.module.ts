import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PoliciesGuard } from "../rbac/policies.guard";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthController } from "./auth.controller";
import { AuthStateService } from "./auth-state.service";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthStateService,
    TokenService,
    // Order matters: authenticate first, then check permissions.
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
  ],
  exports: [AuthService, AuthStateService, TokenService],
})
export class AuthModule {}
