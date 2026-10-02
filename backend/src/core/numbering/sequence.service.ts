import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Reference number formats (PROJECT_PLAN §7.2). `yearly` sequences restart every January. */
const FORMATS = {
  customer: { prefix: "MKC", yearly: false, pad: 6 },
  lead: { prefix: "MKL", yearly: true, pad: 6 },
  package: { prefix: "PKG", yearly: false, pad: 4 },
  // Quotations are numbered QT-1, QT-2, QT-3… with no padding and no yearly restart.
  itinerary: { prefix: "QT", yearly: false, pad: 0 },
  booking: { prefix: "MKB", yearly: true, pad: 6 },
  partner: { prefix: "MKP", yearly: false, pad: 4 },
  receipt: { prefix: "MKR", yearly: true, pad: 6 },
  enquiry: { prefix: "MKE", yearly: true, pad: 6 },
  invoice: { prefix: "MKV", yearly: true, pad: 6 },
} as const;

export type SequenceKey = keyof typeof FORMATS;

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the next reference number, e.g. `MKL-26-000418`.
   * Uses a single atomic upsert, so concurrent requests never get the same number.
   * Pass the transaction client to keep numbering inside the caller's transaction.
   */
  async next(key: SequenceKey, tx: Prisma.TransactionClient = this.prisma): Promise<string> {
    const format = FORMATS[key];
    const year = format.yearly ? new Date().getFullYear() : 0;
    const rows = await tx.$queryRaw<{ current: number }[]>`
      INSERT INTO "NumberSequence" ("key", "year", "current") VALUES (${key}, ${year}, 1)
      ON CONFLICT ("key", "year") DO UPDATE SET "current" = "NumberSequence"."current" + 1
      RETURNING "current"`;
    const number = String(rows[0]!.current).padStart(format.pad, "0");
    return format.yearly ? `${format.prefix}-${String(year).slice(2)}-${number}` : `${format.prefix}-${number}`;
  }
}
