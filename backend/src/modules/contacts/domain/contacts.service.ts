import { Injectable } from "@nestjs/common";
import { accessibleBy } from "@casl/prisma";
import type { ContactData, ContactListQuery, ContactRow, ContactUpdateData, Paginated } from "@mashkoor/shared";
import type { Contact, Prisma } from "@prisma/client";
import { paginate, toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toRow = (c: Contact): ContactRow => ({
  id: c.id,
  type: c.type,
  name: c.name,
  phone: c.phone,
  altPhone: c.altPhone,
  email: c.email,
  company: c.company,
  designation: c.designation,
  city: c.city,
  state: c.state,
  notes: c.notes,
  lastContactedAt: toIso(c.lastContactedAt),
  createdAt: toIso(c.createdAt)!,
});

/**
 * M02+ · A small rolodex for people who aren't a travel customer and don't have a portal account — a hotel's
 * reservations contact, a visa agent, a referral source. Deliberately not linked to bills or payments.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser, query: ContactListQuery): Promise<Paginated<ContactRow>> {
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", "Contact")) throw AppError.forbidden();
    const q = query.q?.trim();
    const where: Prisma.ContactWhereInput = {
      AND: [
        accessibleBy(ability).Contact,
        query.type ? { type: query.type } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({ where, orderBy: { name: "asc" }, ...paginate(query.page, query.pageSize) }),
      this.prisma.contact.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(actor: RequestUser, id: string): Promise<ContactRow> {
    if (!this.abilities.forUser(actor).can("read", "Contact")) throw AppError.forbidden();
    return toRow(await this.find(id));
  }

  async create(actor: RequestUser, input: ContactData): Promise<ContactRow> {
    if (!this.abilities.forUser(actor).can("create", "Contact")) throw AppError.forbidden();
    const created = await this.prisma.contact.create({ data: { ...input, createdById: actor.id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "contact.created", entityType: "Contact", entityId: created.id, after: { name: created.name, type: created.type } });
    return toRow(created);
  }

  async update(actor: RequestUser, id: string, input: ContactUpdateData): Promise<ContactRow> {
    if (!this.abilities.forUser(actor).can("update", "Contact")) throw AppError.forbidden();
    const before = await this.find(id);
    const after = await this.prisma.contact.update({ where: { id }, data: input });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "contact.updated", entityType: "Contact", entityId: id, before: { name: before.name }, after: { fields: Object.keys(input) } });
    return toRow(after);
  }

  /** One-click log that someone reached out, without writing a full note. */
  async markContacted(actor: RequestUser, id: string): Promise<ContactRow> {
    if (!this.abilities.forUser(actor).can("update", "Contact")) throw AppError.forbidden();
    await this.find(id);
    return toRow(await this.prisma.contact.update({ where: { id }, data: { lastContactedAt: new Date() } }));
  }

  async remove(actor: RequestUser, id: string) {
    if (!this.abilities.forUser(actor).can("delete", "Contact")) throw AppError.forbidden();
    const contact = await this.find(id);
    await this.prisma.contact.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "contact.deleted", entityType: "Contact", entityId: id, before: { name: contact.name } });
  }

  private async find(id: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id } });
    if (!contact) throw AppError.notFound("Contact");
    return contact;
  }
}
