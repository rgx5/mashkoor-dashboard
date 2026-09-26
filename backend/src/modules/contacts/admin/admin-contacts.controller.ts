import { Body, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { contactInputSchema, contactListQuerySchema, contactUpdateSchema, type ContactData, type ContactListQuery, type ContactUpdateData } from "@mashkoor/shared";
import { CurrentUser, PortalController } from "../../../core/auth/decorators";
import type { RequestUser } from "../../../core/auth/request-user";
import { ZodPipe } from "../../../core/http/zod.pipe";
import { CheckAbility } from "../../../core/rbac/policies.guard";
import { ContactsService } from "../domain/contacts.service";

/** `/api/v1/admin/contacts` — suppliers, agents and general contacts. Not a customer, not a financial record. */
@PortalController("admin", "contacts")
export class AdminContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @CheckAbility("read", "Contact")
  list(@CurrentUser() actor: RequestUser, @Query(new ZodPipe(contactListQuerySchema)) query: ContactListQuery) {
    return this.contacts.list(actor, query);
  }

  @Get(":id")
  @CheckAbility("read", "Contact")
  get(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.contacts.get(actor, id);
  }

  @Post()
  @CheckAbility("create", "Contact")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodPipe(contactInputSchema)) body: ContactData) {
    return this.contacts.create(actor, body);
  }

  @Patch(":id")
  @CheckAbility("update", "Contact")
  update(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(contactUpdateSchema)) body: ContactUpdateData) {
    return this.contacts.update(actor, id, body);
  }

  @Post(":id/mark-contacted")
  @HttpCode(200)
  @CheckAbility("update", "Contact")
  markContacted(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.contacts.markContacted(actor, id);
  }

  @Delete(":id")
  @HttpCode(204)
  @CheckAbility("delete", "Contact")
  remove(@CurrentUser() actor: RequestUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.contacts.remove(actor, id);
  }
}
