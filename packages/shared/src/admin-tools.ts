import { z } from "zod";
import { emailField } from "./crm";
import { listQuerySchema } from "./pagination";

// ─── Notifications (M12) ────────────────────────────────────────────────────

export const NOTIFICATION_STATUSES = ["QUEUED", "SENT", "FAILED"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const notificationListQuerySchema = listQuerySchema.extend({ status: z.enum(NOTIFICATION_STATUSES).optional() });
export type NotificationListQuery = z.output<typeof notificationListQuerySchema>;

export const testEmailSchema = z.object({ to: emailField });

export interface NotificationRow {
  id: string;
  event: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: NotificationStatus;
  provider: string;
  error: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

export interface IntegrationStatus {
  mail: { provider: "console" | "msg91"; configured: boolean; from: string | null; missing: string[] };
  payments: { gateway: "mock"; note: string };
  whatsapp: { mode: "click-to-chat" };
}

// ─── Audit log viewer ───────────────────────────────────────────────────────

export const auditListQuerySchema = listQuerySchema.extend({
  entityType: z.string().trim().max(60).optional(),
  actorId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AuditListQuery = z.output<typeof auditListQuerySchema>;

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; name: string } | null;
  portal: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

// ─── Data import ────────────────────────────────────────────────────────────

export const IMPORT_ENTITIES = ["customers", "leads"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export const importRequestSchema = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  /** false = validate only (preview); true = create the valid rows. */
  commit: z.boolean().default(false),
  rows: z.array(z.record(z.string(), z.string().nullable().optional())).min(1, "The file has no rows").max(2000, "Import up to 2,000 rows at a time"),
});
export type ImportRequest = z.output<typeof importRequestSchema>;

export interface ImportRowResult {
  /** 1-based data row number (excluding the header). */
  line: number;
  status: "valid" | "invalid" | "duplicate" | "imported" | "failed";
  label: string;
  errors: string[];
}

export interface ImportResult {
  entity: ImportEntity;
  committed: boolean;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  imported: number;
  rows: ImportRowResult[];
}

// ─── Partner users (B2B) ────────────────────────────────────────────────────

export const partnerUserInviteSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(160),
  email: emailField,
  role: z.enum(["PARTNER_ADMIN", "PARTNER_USER"]).default("PARTNER_USER"),
});
export type PartnerUserInvite = z.output<typeof partnerUserInviteSchema>;

export interface PartnerUserRow {
  id: string;
  name: string;
  email: string;
  role: "PARTNER_ADMIN" | "PARTNER_USER";
  status: "INVITED" | "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
}

// ─── Inbound events (M13) ───────────────────────────────────────────────────

export const INBOUND_CHANNELS = ["WEBSITE", "WEBSITE_BOOKING", "WHATSAPP", "INSTAGRAM", "META_LEAD_AD", "PAYMENT_GATEWAY"] as const;
export type InboundChannel = (typeof INBOUND_CHANNELS)[number];
export const INBOUND_STATUSES = ["RECEIVED", "PROCESSED", "FAILED", "IGNORED"] as const;
export type InboundStatus = (typeof INBOUND_STATUSES)[number];

export const inboundEventListQuerySchema = listQuerySchema.extend({ channel: z.enum(INBOUND_CHANNELS).optional(), status: z.enum(INBOUND_STATUSES).optional() });
export type InboundEventListQuery = z.output<typeof inboundEventListQuerySchema>;

export interface InboundEventRow {
  id: string;
  channel: InboundChannel;
  status: InboundStatus;
  /** One line describing what arrived, e.g. the enquirer or the payment event. */
  summary: string;
  error: string | null;
  leadId: string | null;
  createdAt: string;
  processedAt: string | null;
}
