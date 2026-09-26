import { Injectable } from "@nestjs/common";
import type { Paginated, UserRef, WalletAdjustInput, WalletLedgerRow, WalletSummary, WalletTopUpInput } from "@mashkoor/shared";
import type { Prisma, WalletEntryType, WalletLedgerEntry } from "@prisma/client";
import { paginate, toIso } from "../../../common/serialize";
import { loadUserRefs } from "../../../common/user-refs";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { MailService } from "../../../core/mail/mail.service";
import { emails } from "../../../core/mail/templates";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toLedgerRow = (e: WalletLedgerEntry, users: Map<string, UserRef>): WalletLedgerRow => ({
  id: e.id,
  type: e.type,
  amount: e.amount,
  balanceAfter: e.balanceAfter,
  referenceType: e.referenceType,
  referenceId: e.referenceId,
  note: e.note,
  createdBy: (e.createdById && users.get(e.createdById)) || null,
  createdAt: toIso(e.createdAt)!,
});

/**
 * M09 · Wallet & credit — an append-only ledger backing each partner's balance. `debit`/`refund` are
 * called by BookingsModule when a B2B booking is confirmed or cancelled; every change goes through a
 * single guarded UPDATE so concurrent bookings can never push the balance past the credit limit.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /** Creates the wallet the first time a partner is approved. Idempotent. */
  async ensureAccount(partnerId: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.walletAccount.upsert({ where: { partnerId }, update: {}, create: { partnerId } });
  }

  async summary(actor: RequestUser, partnerId: string): Promise<WalletSummary> {
    this.assertCanView(actor, partnerId);
    const wallet = await this.ensureAccount(partnerId);
    return { partnerId, balance: wallet.balance, creditLimit: wallet.creditLimit, available: wallet.balance + wallet.creditLimit };
  }

  async ledger(actor: RequestUser, partnerId: string, page: number, pageSize: number): Promise<Paginated<WalletLedgerRow>> {
    this.assertCanView(actor, partnerId);
    const wallet = await this.ensureAccount(partnerId);
    const where: Prisma.WalletLedgerEntryWhereInput = { walletAccountId: wallet.id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.walletLedgerEntry.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(page, pageSize) }),
      this.prisma.walletLedgerEntry.count({ where }),
    ]);
    const users = await loadUserRefs(this.prisma, rows.map((r) => r.createdById));
    return { data: rows.map((r) => toLedgerRow(r, users)), meta: { page, pageSize, total } };
  }

  async topUp(actor: RequestUser, partnerId: string, input: WalletTopUpInput): Promise<WalletSummary> {
    if (!this.abilities.forUser(actor).can("manage", "Partner")) throw AppError.forbidden();
    const wallet = await this.prisma.$transaction(async (tx) => {
      const account = await this.ensureAccount(partnerId, tx);
      // Atomic increment; the returned row holds the exact balance (no read-modify-write race).
      const updated = await tx.walletAccount.update({ where: { id: account.id }, data: { balance: { increment: input.amount } } });
      await tx.walletLedgerEntry.create({ data: { walletAccountId: account.id, type: "TOPUP", amount: input.amount, balanceAfter: updated.balance, note: input.note, createdById: actor.id } });
      return updated;
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "wallet.topup", entityType: "WalletAccount", entityId: wallet.id, after: { amount: input.amount } });
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { contactName: true, email: true } });
    if (partner) {
      await this.mail.send({ ...emails.walletTopUp({ contactName: partner.contactName, amount: input.amount, balance: wallet.balance, note: input.note ?? null }), to: partner.email, toName: partner.contactName, entityType: "WalletAccount", entityId: wallet.id });
    }
    return { partnerId, balance: wallet.balance, creditLimit: wallet.creditLimit, available: wallet.balance + wallet.creditLimit };
  }

  async adjust(actor: RequestUser, partnerId: string, input: WalletAdjustInput): Promise<WalletSummary> {
    if (!this.abilities.forUser(actor).can("manage", "Partner")) throw AppError.forbidden();
    const type: WalletEntryType = input.direction === "CREDIT" ? "ADJUSTMENT_CREDIT" : "ADJUSTMENT_DEBIT";
    const wallet = await this.prisma.$transaction(async (tx) => {
      const account = await this.ensureAccount(partnerId, tx);
      const updated =
        input.direction === "CREDIT"
          ? await tx.walletAccount.update({ where: { id: account.id }, data: { balance: { increment: input.amount } } })
          : await this.guardedDecrement(tx, account, input.amount, "This adjustment would take the partner below their credit limit");
      await tx.walletLedgerEntry.create({ data: { walletAccountId: account.id, type, amount: input.amount, balanceAfter: updated.balance, note: input.note, createdById: actor.id } });
      return updated;
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "wallet.adjusted", entityType: "WalletAccount", entityId: wallet.id, after: input });
    return { partnerId, balance: wallet.balance, creditLimit: wallet.creditLimit, available: wallet.balance + wallet.creditLimit };
  }

  async setCreditLimit(actor: RequestUser, partnerId: string, creditLimit: number): Promise<WalletSummary> {
    if (!this.abilities.forUser(actor).can("manage", "Partner")) throw AppError.forbidden();
    const account = await this.ensureAccount(partnerId);
    const updated = await this.prisma.walletAccount.update({ where: { id: account.id }, data: { creditLimit } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "wallet.credit_limit_set", entityType: "WalletAccount", entityId: account.id, before: { creditLimit: account.creditLimit }, after: { creditLimit } });
    return { partnerId, balance: updated.balance, creditLimit: updated.creditLimit, available: updated.balance + updated.creditLimit };
  }

  /** Debits a confirmed B2B booking. Throws if it would exceed the partner's balance + credit limit. */
  async debit(tx: Prisma.TransactionClient, partnerId: string, amount: number, ref: { referenceType: string; referenceId: string; note?: string }) {
    const account = await this.ensureAccount(partnerId, tx);
    const updated = await this.guardedDecrement(tx, account, amount, "This partner doesn't have enough balance or credit for this booking");
    await tx.walletLedgerEntry.create({ data: { walletAccountId: account.id, type: "DEBIT", amount, balanceAfter: updated.balance, ...ref } });
  }

  /** Reverses a debit, e.g. when a confirmed booking is cancelled. */
  async refund(tx: Prisma.TransactionClient, partnerId: string, amount: number, ref: { referenceType: string; referenceId: string; note?: string }) {
    const account = await this.ensureAccount(partnerId, tx);
    const updated = await tx.walletAccount.update({ where: { id: account.id }, data: { balance: { increment: amount } } });
    await tx.walletLedgerEntry.create({ data: { walletAccountId: account.id, type: "REFUND", amount, balanceAfter: updated.balance, ...ref } });
  }

  /** True when the partner could afford this amount right now (checked before creating a B2B booking). */
  async canAfford(partnerId: string, amount: number): Promise<boolean> {
    const account = await this.ensureAccount(partnerId);
    return account.balance + account.creditLimit >= amount;
  }

  /**
   * Subtracts `amount` only if the result stays within the credit limit. The WHERE clause re-checks the live
   * balance when the UPDATE runs, so concurrent debits can't overdraw; the row lock we then hold means the
   * follow-up read returns the exact balance our own debit produced.
   */
  private async guardedDecrement(tx: Prisma.TransactionClient, account: { id: string; creditLimit: number }, amount: number, failureMessage: string) {
    const { count } = await tx.walletAccount.updateMany({ where: { id: account.id, balance: { gte: amount - account.creditLimit } }, data: { balance: { decrement: amount } } });
    if (count === 0) throw AppError.conflict(failureMessage);
    return tx.walletAccount.findUniqueOrThrow({ where: { id: account.id } });
  }

  private assertCanView(actor: RequestUser, partnerId: string) {
    const ability = this.abilities.forUser(actor);
    const isOwnPartner = actor.portal === "b2b" && actor.partnerId === partnerId;
    if (!isOwnPartner && !ability.can("manage", "Partner")) throw AppError.forbidden();
  }
}
