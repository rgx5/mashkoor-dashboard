import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { companyProfileSchema, type CompanyProfile } from "@mashkoor/shared";
import type { RequestUser } from "../../core/auth/request-user";
import { AuditService } from "../../core/audit/audit.service";
import { PrismaService } from "../../core/prisma/prisma.service";

const KEY = "company.profile";

/** Letterhead, tax and bank details the platform prints on quotations. Kept as one `Setting` row. */
@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<CompanyProfile> {
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    const parsed = companyProfileSchema.safeParse({ name: "Mashkoor International Tourism", ...((row?.value as object) ?? {}) });
    return parsed.success ? parsed.data : companyProfileSchema.parse({ name: "Mashkoor International Tourism" });
  }

  async save(actor: RequestUser, input: CompanyProfile): Promise<CompanyProfile> {
    const json = input as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: json, updatedById: actor.id }, update: { value: json, updatedById: actor.id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "company.profile_updated", entityType: "Setting", entityId: KEY });
    return this.get();
  }
}
