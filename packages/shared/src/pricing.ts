import { z } from "zod";
import { PRICING_ADJUSTMENT_TYPES, PRICING_SCOPES, PRODUCT_TYPES, type PricingAdjustmentType, type PricingScope, type ProductType } from "./constants";
import { patchOf } from "./patch";

const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.iso.date("Enter a valid date").nullable());

export const pricingRuleInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name this rule").max(160),
    scope: z.enum(PRICING_SCOPES),
    productType: z.enum(PRODUCT_TYPES).nullable().optional(),
    adjustmentType: z.enum(PRICING_ADJUSTMENT_TYPES),
    value: z.coerce.number().int().min(0),
    priority: z.coerce.number().int().min(0).max(999).default(0),
    validFrom: optionalDate,
    validTo: optionalDate,
    active: z.boolean().default(true),
  })
  .refine((v) => v.adjustmentType !== "PERCENT_MARKUP" || v.value <= 500, { path: ["value"], message: "That's an unusually large markup — double-check it" })
  .refine((v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom, { path: ["validTo"], message: "End date must be after the start date" });
export type PricingRuleInput = z.input<typeof pricingRuleInputSchema>;
export type PricingRuleData = z.output<typeof pricingRuleInputSchema>;

export const pricingRuleUpdateSchema = patchOf(
  z.object({
    name: z.string().trim().min(2).max(160),
    scope: z.enum(PRICING_SCOPES),
    productType: z.enum(PRODUCT_TYPES).nullable(),
    adjustmentType: z.enum(PRICING_ADJUSTMENT_TYPES),
    value: z.coerce.number().int().min(0),
    priority: z.coerce.number().int().min(0).max(999),
    validFrom: optionalDate,
    validTo: optionalDate,
    active: z.boolean(),
  }),
);
export type PricingRuleUpdateData = z.output<typeof pricingRuleUpdateSchema>;

export interface PricingRule {
  id: string;
  name: string;
  scope: PricingScope;
  productType: ProductType | null;
  adjustmentType: PricingAdjustmentType;
  value: number;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
  createdAt: string;
}

export const priceQuoteSchema = z.object({
  scope: z.enum(PRICING_SCOPES).default("B2C"),
  productType: z.enum(PRODUCT_TYPES),
  costPrice: z.coerce.number().int().min(0),
  date: optionalDate,
});
export type PriceQuoteInput = z.output<typeof priceQuoteSchema>;

export interface PriceQuoteResult {
  costPrice: number;
  sellPrice: number;
  margin: number;
  marginPercent: number;
  appliedRule: { id: string; name: string; adjustmentType: PricingAdjustmentType; value: number } | null;
}
