import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Typed defaults for every setting the platform reads. Stored values override these. */
export const SETTING_DEFAULTS = {
  /** How new unassigned leads get an owner. */
  "leads.assignment": { mode: "manual" as "manual" | "round_robin", lastAssignedUserId: null as string | null },
  /** Hours a NEW lead may sit untouched before it is flagged. */
  "leads.newLeadAlertHours": 2,
  /** An inbound enquiry from the same contact within this many days is added to the open lead instead of creating a new one. */
  "leads.dedupeWindowDays": 30,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K];

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K, tx: Prisma.TransactionClient = this.prisma): Promise<SettingValue<K>> {
    const row = await tx.setting.findUnique({ where: { key } });
    const fallback = SETTING_DEFAULTS[key];
    if (!row) return fallback;
    return (typeof fallback === "object" && fallback !== null ? { ...fallback, ...(row.value as object) } : row.value) as SettingValue<K>;
  }

  async set<K extends SettingKey>(key: K, value: SettingValue<K>, updatedById?: string, tx: Prisma.TransactionClient = this.prisma) {
    const json = value as unknown as Prisma.InputJsonValue;
    await tx.setting.upsert({ where: { key }, create: { key, value: json, updatedById }, update: { value: json, updatedById } });
  }
}
