import { RequireFeatures } from "../../../core/features/require-features";
import { Body, Get, Param, ParseUUIDPipe, Patch, Post, Query, Delete } from "@nestjs/common";
import { listQuerySchema, testimonialInputSchema, testimonialUpdateSchema, type ListQuery, type TestimonialData, type TestimonialUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { TestimonialsService } from "../domain/testimonials.service";
import { RevalidatesSite } from "../../../core/site/revalidate.interceptor";

/** `/api/v1/admin/testimonials` */
@RevalidatesSite("testimonials")
@PortalController("admin", "testimonials")
@RequireFeatures("website")
export class AdminTestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get()
  @CheckAbility("read", "Testimonial")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(listQuerySchema)) query: ListQuery) {
    return this.testimonials.list(actor, query);
  }

  @Post()
  @CheckAbility("create", "Testimonial")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(testimonialInputSchema)) body: TestimonialData) {
    return this.testimonials.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Testimonial")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(testimonialUpdateSchema)) body: TestimonialUpdateData) {
    return this.testimonials.update(actor, id, body);
  }

  @Delete(":id")
  @CheckAbility("delete", "Testimonial")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.testimonials.remove(actor, id);
  }
}
