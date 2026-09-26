import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import type { Traveler as TravelerDto, TravelerData } from "@mashkoor/shared";
import type { Traveler } from "@prisma/client";
import { fromDateOnly, toDateOnly } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { FieldEncryptionService } from "../../../core/crypto/field-encryption.service";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

/** M01 · Travellers (family / group members of a customer). Passport numbers are encrypted at rest. */
@Injectable()
export class TravelersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly encryption: FieldEncryptionService,
    private readonly audit: AuditService,
  ) {}

  toDto(t: Traveler, reveal: boolean): TravelerDto {
    return {
      id: t.id,
      customerId: t.customerId,
      title: t.title,
      firstName: t.firstName,
      lastName: t.lastName,
      gender: t.gender,
      dob: toDateOnly(t.dob),
      nationality: t.nationality,
      relation: t.relation,
      passportNo: t.passportNoEnc ? (reveal ? this.encryption.decrypt(t.passportNoEnc) : `••••${t.passportLast4 ?? ""}`) : null,
      passportExpiry: toDateOnly(t.passportExpiry),
      passportIssuePlace: t.passportIssuePlace,
      mealPreference: t.mealPreference,
      specialNeeds: t.specialNeeds,
    };
  }

  async create(actor: RequestUser, customerId: string, input: TravelerData): Promise<TravelerDto> {
    await this.assertCustomerAccess(actor, customerId, "create");
    const traveler = await this.prisma.traveler.create({ data: { customerId, ...this.toData(input) } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "traveler.created", entityType: "Traveler", entityId: traveler.id });
    return this.toDto(traveler, false);
  }

  async update(actor: RequestUser, customerId: string, travelerId: string, input: TravelerData): Promise<TravelerDto> {
    await this.assertCustomerAccess(actor, customerId, "update");
    const existing = await this.find(customerId, travelerId);
    const data = this.toData(input);
    // An empty passport field in the form means "unchanged" when the stored value is masked.
    if (input.passportNo === null && existing.passportNoEnc) {
      delete data.passportNoEnc;
      delete data.passportLast4;
    }
    const traveler = await this.prisma.traveler.update({ where: { id: travelerId }, data });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "traveler.updated", entityType: "Traveler", entityId: travelerId });
    return this.toDto(traveler, false);
  }

  async remove(actor: RequestUser, customerId: string, travelerId: string) {
    await this.assertCustomerAccess(actor, customerId, "delete");
    await this.find(customerId, travelerId);
    // Deleting would silently take this passenger off the booking, so refuse while a live booking still lists them.
    const liveBookings = await this.prisma.booking.findMany({ where: { travelers: { some: { id: travelerId } }, status: { notIn: ["CANCELLED", "FAILED"] } }, select: { refNo: true }, take: 3 });
    if (liveBookings.length) throw AppError.conflict(`This traveller is on ${liveBookings.map((b) => b.refNo).join(", ")}. Remove them from the booking first.`);
    await this.prisma.traveler.delete({ where: { id: travelerId } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "traveler.deleted", entityType: "Traveler", entityId: travelerId });
  }

  /** Returns the full passport number. Every reveal is audited (PROJECT_PLAN §13.2). */
  async revealPassport(actor: RequestUser, customerId: string, travelerId: string) {
    await this.assertCustomerAccess(actor, customerId, "reveal");
    const traveler = await this.find(customerId, travelerId);
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "traveler.passport_revealed", entityType: "Traveler", entityId: travelerId });
    return { passportNo: traveler.passportNoEnc ? this.encryption.decrypt(traveler.passportNoEnc) : null };
  }

  private toData(input: TravelerData) {
    const { passportNo, dob, passportExpiry, ...rest } = input;
    return {
      ...rest,
      dob: fromDateOnly(dob),
      passportExpiry: fromDateOnly(passportExpiry),
      passportNoEnc: passportNo ? this.encryption.encrypt(passportNo) : null,
      passportLast4: passportNo ? passportNo.slice(-4) : null,
    } as {
      [K in keyof typeof rest]: (typeof rest)[K];
    } & { dob?: Date | null; passportExpiry?: Date | null; passportNoEnc?: string | null; passportLast4?: string | null };
  }

  private async find(customerId: string, travelerId: string) {
    const traveler = await this.prisma.traveler.findFirst({ where: { id: travelerId, customerId } });
    if (!traveler) throw AppError.notFound("Traveller");
    return traveler;
  }

  private async assertCustomerAccess(actor: RequestUser, customerId: string, action: "create" | "update" | "delete" | "reveal") {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw AppError.notFound("Customer");
    const ability = this.abilities.forUser(actor);
    if (!ability.can("read", subject("Customer", customer)) || !ability.can(action, "Traveler")) throw AppError.forbidden();
  }
}
