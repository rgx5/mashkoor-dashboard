import { HttpStatus, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ALLOWED_DOCUMENT_TYPES, ERROR_CODES, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_BOOKING, type BookingDocumentRow, type CustomerDocumentRow, type DocumentUploadQuery } from "@mashkoor/shared";
import type { BookingDocument } from "@prisma/client";
import { toIso } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppConfig } from "../../../core/config/app-config.service";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { StorageIntegrityError, StorageService } from "../../../core/storage/storage.service";
import { ActivitiesService } from "../../activities/domain/activities.service";
import { BookingsService } from "../../bookings/domain/bookings.service";
import { CustomerAccountsService } from "../../customers/domain/customer-accounts.service";

const isStaff = (actor: RequestUser) => actor.portal === "admin";
const NAMESPACE = "documents";
const ORPHAN_SWEEP_EVERY_MS = 6 * 3600_000;
/** A file with no database row is only deleted once it is this old, so an upload in flight is never touched. */
const ORPHAN_MIN_AGE_MS = 24 * 3600_000;

/** The first bytes of a real PDF / JPEG / PNG / WebP. The declared type alone is never trusted. */
function sniff(buf: Buffer): (typeof ALLOWED_DOCUMENT_TYPES)[number] | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** File names go into a Content-Disposition header, so keep them to plain, safe characters. */
export const safeFileName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "document";

const toRow = (d: Omit<BookingDocument, "data" | "storageKey" | "sha256">): BookingDocumentRow => ({
  id: d.id,
  kind: d.kind,
  name: d.name,
  fileName: d.fileName,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  visibleToCustomer: d.visibleToCustomer,
  createdAt: toIso(d.createdAt)!,
});

const listSelect = { id: true, bookingId: true, kind: true, name: true, fileName: true, mimeType: true, sizeBytes: true, visibleToCustomer: true, uploadedById: true, createdAt: true } as const;

/**
 * Files staff attach to a booking: visas, e-tickets, hotel vouchers, insurance. The bytes are kept by StorageService
 * (on disk, encrypted, integrity-checked); the database holds only the metadata. Customers and agencies see only the
 * documents marked visible, and only on their own bookings — every download goes through an authenticated route.
 */
@Injectable()
export class BookingDocumentsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Documents");
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly activities: ActivitiesService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly accounts: CustomerAccountsService,
    private readonly storage: StorageService,
  ) {}

  onApplicationBootstrap() {
    // Documents uploaded before file storage existed live in the database; move them onto disk, then keep the folder tidy.
    void this.migrateLegacyToFiles().catch((error) => this.logger.error("Moving legacy documents to file storage failed", error instanceof Error ? error.stack : undefined));
    this.timer = setInterval(() => void this.sweepOrphans().catch((error) => this.logger.warn(`Orphan sweep failed: ${error instanceof Error ? error.message : error}`)), ORPHAN_SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list(actor: RequestUser, bookingId: string): Promise<BookingDocumentRow[]> {
    await this.bookings.findAccessible(actor, bookingId, "read");
    const rows = await this.prisma.bookingDocument.findMany({
      where: { bookingId, ...(isStaff(actor) ? {} : { visibleToCustomer: true }) },
      select: listSelect,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toRow);
  }

  async count(bookingId: string, customerVisibleOnly = true) {
    return this.prisma.bookingDocument.count({ where: { bookingId, ...(customerVisibleOnly ? { visibleToCustomer: true } : {}) } });
  }

  /**
   * Every document across every booking a customer has — for Customer 360, staff-only. Limited to the bookings the
   * caller may read, so a sales agent doesn't see the file names of another agent's bookings.
   */
  async listForCustomer(actor: RequestUser, customerId: string): Promise<CustomerDocumentRow[]> {
    const readable = this.bookings.accessibleWhere(actor);
    const rows = await this.prisma.bookingDocument.findMany({
      where: { AND: [{ booking: { customerId } }, { booking: readable }] },
      select: { ...listSelect, booking: { select: { id: true, refNo: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((d) => ({ ...toRow(d), booking: d.booking }));
  }

  async upload(actor: RequestUser, bookingId: string, meta: DocumentUploadQuery, body: Buffer): Promise<BookingDocumentRow> {
    if (!isStaff(actor)) throw AppError.forbidden();
    const booking = await this.bookings.findAccessible(actor, bookingId, "update");

    if (body.length === 0) throw this.invalid("The file is empty");
    if (body.length > MAX_DOCUMENT_BYTES) throw this.invalid(`Files can be up to ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`);
    const type = sniff(body);
    if (!type) throw this.invalid(`Upload a ${ALLOWED_DOCUMENT_TYPES.map((t) => t.split("/")[1]!.toUpperCase()).join(", ")} file`);
    if ((await this.count(bookingId, false)) >= MAX_DOCUMENTS_PER_BOOKING) throw AppError.conflict(`A booking can hold up to ${MAX_DOCUMENTS_PER_BOOKING} documents`);

    const stored = await this.storage.save(NAMESPACE, body);
    let doc: Omit<BookingDocument, "data" | "storageKey" | "sha256"> & { bookingId: string };
    try {
      doc = await this.prisma.bookingDocument.create({
        data: { bookingId, kind: meta.kind, name: meta.name, fileName: safeFileName(meta.fileName), mimeType: type, sizeBytes: stored.size, storageKey: stored.key, sha256: stored.sha256, visibleToCustomer: meta.visibleToCustomer, uploadedById: actor.id },
        select: listSelect,
      });
    } catch (error) {
      await this.storage.remove(stored.key).catch(() => undefined); // no row → no orphan file
      throw error;
    }
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.document_added", entityType: "Booking", entityId: bookingId, after: { name: meta.name, kind: meta.kind, visibleToCustomer: meta.visibleToCustomer } });
    if (meta.visibleToCustomer) {
      await this.activities.record({ entityType: "CUSTOMER", entityId: booking.customerId, customerId: booking.customerId, type: "SYSTEM", body: `Document shared on ${booking.refNo}: ${meta.name}`, actorId: actor.id });
      if (meta.notify) await this.notify(booking, meta.name, doc.id);
    }
    return toRow(doc);
  }

  /** Returns the file bytes. A customer or agency can only download documents marked visible on their own booking. */
  async download(actor: RequestUser, documentId: string) {
    const doc = await this.prisma.bookingDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw AppError.notFound("Document");
    await this.bookings.findAccessible(actor, doc.bookingId, "read");
    if (!isStaff(actor) && !doc.visibleToCustomer) throw AppError.notFound("Document");

    let data: Buffer;
    if (doc.storageKey) {
      try {
        data = await this.storage.read(doc.storageKey, doc.sha256);
      } catch (error) {
        if (error instanceof StorageIntegrityError) {
          this.logger.error(`Document ${doc.id} failed its integrity check (${doc.storageKey})`);
          throw new AppError(HttpStatus.INTERNAL_SERVER_ERROR, "FILE_CORRUPT", "This file could not be verified. Please ask us to upload it again.");
        }
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          this.logger.error(`Document ${doc.id} is missing from storage (${doc.storageKey})`);
          throw new AppError(HttpStatus.NOT_FOUND, "FILE_MISSING", "This file is no longer available. Please ask us to upload it again.");
        }
        throw error;
      }
    } else if (doc.data) {
      data = Buffer.from(doc.data); // legacy row not moved yet
    } else {
      throw AppError.notFound("Document");
    }
    return { fileName: doc.fileName, mimeType: doc.mimeType, data };
  }

  async setVisibility(actor: RequestUser, documentId: string, visibleToCustomer: boolean): Promise<BookingDocumentRow> {
    if (!isStaff(actor)) throw AppError.forbidden();
    const existing = await this.prisma.bookingDocument.findUnique({ where: { id: documentId }, select: { bookingId: true } });
    if (!existing) throw AppError.notFound("Document");
    await this.bookings.findAccessible(actor, existing.bookingId, "update");
    return toRow(await this.prisma.bookingDocument.update({ where: { id: documentId }, data: { visibleToCustomer }, select: listSelect }));
  }

  async remove(actor: RequestUser, documentId: string) {
    if (!isStaff(actor)) throw AppError.forbidden();
    const doc = await this.prisma.bookingDocument.findUnique({ where: { id: documentId }, select: { bookingId: true, name: true, storageKey: true } });
    if (!doc) throw AppError.notFound("Document");
    await this.bookings.findAccessible(actor, doc.bookingId, "update");
    await this.prisma.bookingDocument.delete({ where: { id: documentId } });
    if (doc.storageKey) await this.storage.remove(doc.storageKey).catch((error) => this.logger.warn(`Could not delete file ${doc.storageKey}: ${error instanceof Error ? error.message : error}`));
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "booking.document_removed", entityType: "Booking", entityId: doc.bookingId, before: { name: doc.name } });
  }

  /** Moves documents that still hold their bytes in the database onto disk. Safe to run repeatedly. */
  async migrateLegacyToFiles(batchSize = 20): Promise<number> {
    let moved = 0;
    for (;;) {
      const rows = await this.prisma.bookingDocument.findMany({ where: { storageKey: null, data: { not: null } }, select: { id: true, data: true }, take: batchSize });
      if (rows.length === 0) break;
      for (const row of rows) {
        const stored = await this.storage.save(NAMESPACE, Buffer.from(row.data!));
        try {
          const { count } = await this.prisma.bookingDocument.updateMany({ where: { id: row.id, storageKey: null }, data: { storageKey: stored.key, sha256: stored.sha256, data: null } });
          if (count === 0) await this.storage.remove(stored.key);
          else moved += 1;
        } catch (error) {
          await this.storage.remove(stored.key).catch(() => undefined);
          throw error;
        }
      }
    }
    if (moved > 0) this.logger.log(`Moved ${moved} document(s) from the database to file storage`);
    return moved;
  }

  /** Deletes stored files that no database row points to (e.g. after a crash between writing the file and the row). */
  async sweepOrphans(): Promise<number> {
    const candidates = await this.storage.listOlderThan(NAMESPACE, ORPHAN_MIN_AGE_MS);
    let removed = 0;
    for (let i = 0; i < candidates.length; i += 200) {
      const chunk = candidates.slice(i, i + 200);
      const known = new Set((await this.prisma.bookingDocument.findMany({ where: { storageKey: { in: chunk } }, select: { storageKey: true } })).map((r) => r.storageKey));
      for (const key of chunk) {
        if (known.has(key)) continue;
        await this.storage.remove(key);
        removed += 1;
      }
    }
    if (removed > 0) this.logger.log(`Removed ${removed} orphaned file(s) from storage`);
    return removed;
  }

  private invalid(message: string) {
    return new AppError(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED, message);
  }

  private async notify(booking: { id: string; refNo: string; customerId: string; partnerId: string | null }, documentName: string, documentId: string) {
    const url = (path: string) => `${this.config.get("APP_URL")}${path}`;
    if (booking.partnerId) {
      const partner = await this.prisma.partner.findUnique({ where: { id: booking.partnerId }, select: { contactName: true, email: true } });
      if (!partner) return;
      await this.mail.send({
        ...emails.documentShared({ recipientName: partner.contactName, bookingRef: booking.refNo, documentName, url: url(`/b2b/bookings/${booking.id}`) }),
        to: partner.email,
        toName: partner.contactName,
        dedupeKey: `booking-doc:${documentId}`,
        entityType: "Booking",
        entityId: booking.id,
      });
      return;
    }
    const customer = await this.prisma.customer.findUnique({ where: { id: booking.customerId }, select: { fullName: true, email: true } });
    if (!customer?.email) return;
    await this.accounts.ensureAccount(booking.customerId);
    await this.mail.send({
      ...emails.documentShared({ recipientName: customer.fullName, bookingRef: booking.refNo, documentName, url: url(`/b2c/trips/${booking.id}`) }),
      to: customer.email,
      toName: customer.fullName,
      dedupeKey: `booking-doc:${documentId}`,
      entityType: "Booking",
      entityId: booking.id,
    });
  }
}
