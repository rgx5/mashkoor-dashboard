import { Module } from "@nestjs/common";
import { AdminContactsController } from "./admin/admin-contacts.controller";
import { ContactsService } from "./domain/contacts.service";

/** A small rolodex: suppliers, agents, general contacts. Not a customer, not linked to bills or payments. */
@Module({
  controllers: [AdminContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
