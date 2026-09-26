import { Injectable, Logger } from "@nestjs/common";
import type { Portal } from "@mashkoor/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  actorId?: string | null;
  portal?: Portal | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

const SENSITIVE_KEYS = new Set(["passwordHash", "tokenHash", "password"]);

const scrub = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value, (key, v) => (SENSITIVE_KEYS.has(key) ? undefined : v)));
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Records a sensitive action. Never throws — an audit failure must not break the request. */
  async record(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma) {
    try {
      await tx.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          portal: entry.portal ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: scrub(entry.before),
          after: scrub(entry.after),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log for ${entry.action}`, error instanceof Error ? error.stack : undefined);
    }
  }
}
