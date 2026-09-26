import { Injectable } from "@nestjs/common";
import { subject } from "@casl/ability";
import { accessibleBy } from "@casl/prisma";
import type { PriceQuoteInput, PriceQuoteResult, PricingRule as PricingRuleDto, PricingRuleData, PricingRuleUpdateData } from "@mashkoor/shared";
import type { Prisma, PricingRule } from "@prisma/client";
import { toDateOnly } from "../../../common/serialize";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestUser } from "../../../core/auth/request-user";
import { AppError } from "../../../core/http/app-error";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AbilityFactory } from "../../../core/rbac/ability.factory";

const toDto = (r: PricingRule): PricingRuleDto => ({
  id: r.id,
  name: r.name,
  scope: r.scope,
  productType: r.productType,
  adjustmentType: r.adjustmentType,
  value: r.value,
  priority: r.priority,
  validFrom: toDateOnly(r.validFrom),
  validTo: toDateOnly(r.validTo),
  active: r.active,
  createdAt: r.createdAt.toISOString(),
});

/** M06 · Pricing engine — rules that turn a cost price into a selling price, and the calculator behind it. */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: AbilityFactory,
    private readonly audit: AuditService,
  ) {}

  async list(actor: RequestUser): Promise<PricingRuleDto[]> {
    const ability = this.abilities.forUser(actor);
    const where: Prisma.PricingRuleWhereInput = accessibleBy(ability).PricingRule;
    const rows = await this.prisma.pricingRule.findMany({ where, orderBy: [{ scope: "asc" }, { priority: "asc" }] });
    return rows.map(toDto);
  }

  async create(actor: RequestUser, input: PricingRuleData): Promise<PricingRuleDto> {
    if (!this.abilities.forUser(actor).can("create", "PricingRule")) throw AppError.forbidden();
    const created = await this.prisma.pricingRule.create({
      data: { ...input, validFrom: input.validFrom ? new Date(input.validFrom) : null, validTo: input.validTo ? new Date(input.validTo) : null, createdById: actor.id },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "pricingRule.created", entityType: "PricingRule", entityId: created.id, after: created });
    return toDto(created);
  }

  async update(actor: RequestUser, id: string, input: PricingRuleUpdateData): Promise<PricingRuleDto> {
    const before = await this.findAccessible(actor, id, "update");
    const after = await this.prisma.pricingRule.update({
      where: { id },
      data: { ...input, validFrom: input.validFrom === undefined ? undefined : input.validFrom ? new Date(input.validFrom) : null, validTo: input.validTo === undefined ? undefined : input.validTo ? new Date(input.validTo) : null },
    });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "pricingRule.updated", entityType: "PricingRule", entityId: id, before, after });
    return toDto(after);
  }

  async remove(actor: RequestUser, id: string) {
    const rule = await this.findAccessible(actor, id, "delete");
    await this.prisma.pricingRule.delete({ where: { id } });
    await this.audit.record({ actorId: actor.id, portal: actor.portal, action: "pricingRule.deleted", entityType: "PricingRule", entityId: id, before: rule });
  }

  /**
   * Applies the best-matching active rule to a cost price. Rules are ordered by `priority` ascending;
   * the last one that matches wins, so a specific product-type rule (higher priority number) can
   * override a scope-wide default.
   */
  async quote(actor: RequestUser, input: PriceQuoteInput): Promise<PriceQuoteResult> {
    if (!this.abilities.forUser(actor).can("read", "PricingRule")) throw AppError.forbidden();
    const rule = await this.bestRule(input.scope, input.productType, input.date ? new Date(input.date) : new Date());
    const sellPrice = rule ? this.apply(input.costPrice, rule) : input.costPrice;
    return {
      costPrice: input.costPrice,
      sellPrice,
      margin: sellPrice - input.costPrice,
      marginPercent: input.costPrice > 0 ? Math.round(((sellPrice - input.costPrice) / input.costPrice) * 1000) / 10 : 0,
      appliedRule: rule ? { id: rule.id, name: rule.name, adjustmentType: rule.adjustmentType, value: rule.value } : null,
    };
  }

  /** Used internally by BookingsService when a booking item is created without an explicit sell price. */
  async suggestSellPrice(scope: "B2C" | "B2B", productType: PriceQuoteInput["productType"], costPrice: number): Promise<number> {
    const rule = await this.bestRule(scope, productType, new Date());
    return rule ? this.apply(costPrice, rule) : costPrice;
  }

  private apply(costPrice: number, rule: PricingRule): number {
    switch (rule.adjustmentType) {
      case "PERCENT_MARKUP":
        return Math.round(costPrice * (1 + rule.value / 100));
      case "FIXED_MARKUP":
        return costPrice + rule.value;
      case "FIXED_PRICE":
        return rule.value;
    }
  }

  private async bestRule(scope: string, productType: string, date: Date) {
    const rules = await this.prisma.pricingRule.findMany({
      where: {
        scope: scope as never,
        active: true,
        OR: [{ productType: productType as never }, { productType: null }],
        AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: date } }] }, { OR: [{ validTo: null }, { validTo: { gte: date } }] }],
      },
      orderBy: { priority: "asc" },
    });
    // A rule scoped to this exact product type outranks a scope-wide default at the same priority.
    rules.sort((a, b) => a.priority - b.priority || Number(a.productType === null) - Number(b.productType === null));
    return rules.at(-1) ?? null;
  }

  private async findAccessible(actor: RequestUser, id: string, action: "update" | "delete") {
    const rule = await this.prisma.pricingRule.findUnique({ where: { id } });
    if (!rule) throw AppError.notFound("Pricing rule");
    if (!this.abilities.forUser(actor).can(action, subject("PricingRule", rule))) throw AppError.forbidden();
    return rule;
  }
}
