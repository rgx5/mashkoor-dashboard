import { applyDecorators, CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata, UseInterceptors } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { Observable, tap } from "rxjs";
import { WebsiteRevalidator } from "./website-revalidator.service";

const TAGS_KEY = "site:revalidate-tags";

/** After any successful write (POST/PATCH/PUT/DELETE) on the decorated controller, refresh these website cache tags. */
@Injectable()
export class RevalidateInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly site: WebsiteRevalidator,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = context.switchToHttp().getRequest<Request>().method;
    const tags = this.reflector.getAllAndOverride<string[]>(TAGS_KEY, [context.getHandler(), context.getClass()]);
    if (!tags || method === "GET" || method === "HEAD") return next.handle();
    return next.handle().pipe(tap(() => this.site.revalidate(tags)));
  }
}

/** `@RevalidatesSite("packages")` — put on an admin controller whose data the public website shows. */
export const RevalidatesSite = (...tags: string[]) => applyDecorators(SetMetadata(TAGS_KEY, tags), UseInterceptors(RevalidateInterceptor));
