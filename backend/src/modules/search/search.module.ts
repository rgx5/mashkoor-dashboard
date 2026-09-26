import { Get, Module, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, PortalController } from "../../core/auth/decorators";
import type { RequestUser } from "../../core/auth/request-user";
import { ZodPipe } from "../../core/http/zod.pipe";
import { SearchService } from "./search.service";

const searchQuery = z.object({ q: z.string().trim().max(80).default("") });

/** `/api/v1/admin/search?q=` — results are scoped to what the caller's role may read. */
@PortalController("admin", "search")
export class AdminSearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(searchQuery)) query: z.output<typeof searchQuery>) {
    return this.search.search(actor, query.q);
  }
}

/** Global quick-find for the Admin header. */
@Module({ controllers: [AdminSearchController], providers: [SearchService] })
export class SearchModule {}
