import { z } from "zod";
import type { DiscountRow } from "@/features/discounts/infrastructure/discount.repository";

export const DiscountTypeSchema = z.enum(["percentage", "fixed_amount"]);
export const DiscountScopeSchema = z.enum(["global", "category", "item"]);

export type DiscountStatus =
  | "active"
  | "paused"
  | "scheduled"
  | "expired"
  | "exhausted";

export const CreateDiscountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Code is required")
      .max(50, "Code cannot exceed 50 characters"),
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(100, "Name cannot exceed 100 characters"),
    description: z.string().trim().max(500).optional().nullable(),
    discountType: DiscountTypeSchema,
    discountValue: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal amount"),
    minOrderAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal amount")
      .default("0"),
    maxRedemptions: z.number().int().positive().optional().nullable(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional().nullable(),
    scope: DiscountScopeSchema.default("global"),
    targetCategoryIds: z.array(z.string().uuid()).default([]),
    targetItemIds: z.array(z.string().uuid()).default([]),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      const val = Number(data.discountValue);
      if (data.discountType === "percentage") {
        return val > 0 && val <= 100;
      }
      return val > 0 && val <= 1_000_000;
    },
    {
      message:
        "Percentage discount must be between 0.01 and 100. Fixed discount must be between 0.01 and 1,000,000.",
      path: ["discountValue"],
    },
  )
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt) {
        return data.endsAt.getTime() >= data.startsAt.getTime();
      }
      return true;
    },
    {
      message: "Expiration date (endsAt) must be after start date (startsAt).",
      path: ["endsAt"],
    },
  )
  .refine(
    (data) => {
      if (data.scope === "category") {
        return (data.targetCategoryIds?.length ?? 0) > 0;
      }
      return true;
    },
    {
      message: "Target categories must be provided when scope is 'category'.",
      path: ["targetCategoryIds"],
    },
  )
  .refine(
    (data) => {
      if (data.scope === "item") {
        return (data.targetItemIds?.length ?? 0) > 0;
      }
      return true;
    },
    {
      message: "Target items must be provided when scope is 'item'.",
      path: ["targetItemIds"],
    },
  );

export const UpdateDiscountSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    discountValue: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal amount")
      .optional(),
    minOrderAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid decimal amount")
      .optional(),
    maxRedemptions: z.number().int().positive().optional().nullable(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional().nullable(),
    scope: DiscountScopeSchema.optional(),
    targetCategoryIds: z.array(z.string().uuid()).optional(),
    targetItemIds: z.array(z.string().uuid()).optional(),
    isActive: z.boolean().optional(),
    version: z.number().int().positive().optional(),
  })
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt) {
        return data.endsAt.getTime() >= data.startsAt.getTime();
      }
      return true;
    },
    {
      message: "Expiration date (endsAt) must be after start date (startsAt).",
      path: ["endsAt"],
    },
  );

export type CreateDiscountInput = z.infer<typeof CreateDiscountSchema>;
export type UpdateDiscountInput = z.infer<typeof UpdateDiscountSchema>;

export type DiscountOutput = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  discountType: "percentage" | "fixed_amount";
  discountValue: string;
  minOrderAmount: string;
  maxRedemptions: number | null;
  redemptionsCount: number;
  startsAt: Date;
  endsAt: Date | null;
  scope: "global" | "category" | "item";
  targetCategoryIds: string[];
  targetItemIds: string[];
  isActive: boolean;
  version: number;
  status: DiscountStatus;
  createdAt: Date;
  updatedAt: Date;
};

export function calculateDiscountStatus(
  discount: Pick<
    DiscountRow,
    | "isActive"
    | "startsAt"
    | "endsAt"
    | "maxRedemptions"
    | "redemptionsCount"
    | "deletedAt"
  >,
  now: Date = new Date(),
): DiscountStatus {
  if (!discount.isActive) {
    return "paused";
  }
  if (discount.startsAt && discount.startsAt.getTime() > now.getTime()) {
    return "scheduled";
  }
  if (discount.endsAt && discount.endsAt.getTime() < now.getTime()) {
    return "expired";
  }
  if (
    discount.maxRedemptions !== null &&
    discount.maxRedemptions !== undefined &&
    discount.redemptionsCount >= discount.maxRedemptions
  ) {
    return "exhausted";
  }
  return "active";
}

export function formatDiscountOutput(
  discount: DiscountRow,
  now: Date = new Date(),
): DiscountOutput {
  return {
    id: discount.id,
    tenantId: discount.tenantId,
    code: discount.code,
    name: discount.name,
    description: discount.description,
    discountType: discount.discountType,
    discountValue: discount.discountValue,
    minOrderAmount: discount.minOrderAmount,
    maxRedemptions: discount.maxRedemptions,
    redemptionsCount: discount.redemptionsCount,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
    scope: discount.scope,
    targetCategoryIds: discount.targetCategoryIds ?? [],
    targetItemIds: discount.targetItemIds ?? [],
    isActive: discount.isActive,
    version: discount.version,
    status: calculateDiscountStatus(discount, now),
    createdAt: discount.createdAt,
    updatedAt: discount.updatedAt,
  };
}
