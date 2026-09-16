import { z } from "zod";

export class CatalogRuleViolationError extends Error {}

const moneySchema = z.string().regex(/^\d{1,10}\.\d{2}$/);
const catalogStatusSchema = z.enum(["draft", "active", "unavailable"]);

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    sortOrder: z.number().int().nonnegative().default(0),
    status: z.enum(["draft", "active"]).default("draft"),
  })
  .strict();

export const categoryPatchSchema = categoryInputSchema
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict();

export const catalogItemInputSchema = z
  .object({
    categoryId: z.uuid(),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    price: moneySchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    imageAssetId: z.uuid().nullable().optional(),
    videoAssetId: z.uuid().nullable().optional(),
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    isGeneric: z.boolean().default(false),
    genericIcon: z.string().trim().max(32).nullable().optional(),
    trackStock: z.boolean().default(false),
    stockQuantity: z.number().int().nonnegative().default(0),
    status: catalogStatusSchema.default("draft"),
    sortOrder: z.number().int().nonnegative().default(0),
    addonGroupIds: z.array(z.uuid()).max(20).default([]),
  })
  .strict();

export const catalogItemPatchSchema = catalogItemInputSchema
  .partial()
  .extend({
    status: z.enum(["draft", "active", "unavailable", "archived"]).optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const addonOptionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    priceDelta: moneySchema,
    status: z.enum(["active", "unavailable"]).default("active"),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();

export const addonGroupInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    minSelected: z.number().int().nonnegative(),
    maxSelected: z.number().int().nonnegative(),
    sortOrder: z.number().int().nonnegative().default(0),
    status: z.enum(["draft", "active"]).default("draft"),
    options: z.array(addonOptionInputSchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.maxSelected < value.minSelected) {
      context.addIssue({
        code: "custom",
        path: ["maxSelected"],
        message: "maxSelected must be greater than or equal to minSelected.",
      });
    }
    if (value.maxSelected > value.options.length) {
      context.addIssue({
        code: "custom",
        path: ["maxSelected"],
        message: "maxSelected cannot exceed the number of options.",
      });
    }
  });

export const addonGroupPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    minSelected: z.number().int().nonnegative().optional(),
    maxSelected: z.number().int().nonnegative().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
    options: z.array(addonOptionInputSchema).min(1).max(50).optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const comboItemInputSchema = z
  .object({
    itemId: z.uuid(),
    quantity: z.number().int().positive(),
    sortOrder: z.number().int().nonnegative().default(0),
  })
  .strict();

export const comboInputSchema = z
  .object({
    categoryId: z.uuid(),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    price: moneySchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    imageAssetId: z.uuid().nullable().optional(),
    status: catalogStatusSchema.default("draft"),
    items: z.array(comboItemInputSchema).min(1).max(50),
  })
  .strict();

export const comboPatchSchema = comboInputSchema
  .partial()
  .extend({
    status: z.enum(["draft", "active", "unavailable", "archived"]).optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const MEDIA_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const MEDIA_VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export const mediaImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const mediaVideoMimeTypes = ["video/mp4", "video/webm"] as const;

export const mediaUploadInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum([...mediaImageMimeTypes, ...mediaVideoMimeTypes]),
    byteSize: z.number().int().positive().max(MEDIA_VIDEO_MAX_BYTES),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((value, context) => {
    const isImage = (mediaImageMimeTypes as readonly string[]).includes(
      value.mimeType,
    );
    if (isImage && value.byteSize > MEDIA_IMAGE_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["byteSize"],
        message: "Image uploads cannot exceed 10 MB.",
      });
    }
  });

export function normalizeCatalogName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("es-AR");
}

export function assertAddonSelectionBounds(input: {
  minSelected: number;
  maxSelected: number;
  selected: number;
}) {
  if (
    input.minSelected < 0 ||
    input.maxSelected < input.minSelected ||
    input.selected < input.minSelected ||
    input.selected > input.maxSelected
  ) {
    throw new CatalogRuleViolationError(
      "Add-on selection is outside allowed bounds.",
    );
  }
}

export function assertPublishableItem(input: {
  categoryStatus: "draft" | "active" | "archived";
  mediaStatus?: "pending" | "ready" | "failed" | "archived" | null;
}) {
  if (input.categoryStatus !== "active") {
    throw new CatalogRuleViolationError("Item category must be active.");
  }
  if (input.mediaStatus && input.mediaStatus !== "ready") {
    throw new CatalogRuleViolationError("Item media must be ready.");
  }
}

export function assertPublishableCombo(input: {
  categoryStatus: "draft" | "active" | "archived";
  mediaStatus?: "pending" | "ready" | "failed" | "archived" | null;
  items: Array<{
    status: "draft" | "active" | "unavailable" | "archived";
    quantity: number;
  }>;
}) {
  assertPublishableItem({
    categoryStatus: input.categoryStatus,
    mediaStatus: input.mediaStatus,
  });
  if (
    input.items.length === 0 ||
    input.items.some((item) => item.status !== "active" || item.quantity <= 0)
  ) {
    throw new CatalogRuleViolationError(
      "Combo requires active items and quantities.",
    );
  }
}

export function assertArchivableCategory(input: { sellableChildren: number }) {
  if (input.sellableChildren > 0) {
    throw new CatalogRuleViolationError(
      "Archive or move active items and combos before archiving the category.",
    );
  }
}
