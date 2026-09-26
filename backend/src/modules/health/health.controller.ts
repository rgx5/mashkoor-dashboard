import { Controller, Get, HttpStatus } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../../core/auth/decorators";
import { AppError } from "../../core/http/app-error";
import { PrismaService } from "../../core/prisma/prisma.service";

@ApiTags("health")
@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  live() {
    return { status: "ok", time: new Date().toISOString() };
  }

  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "up" };
    } catch {
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, "NOT_READY", "Database unavailable");
    }
  }
}
