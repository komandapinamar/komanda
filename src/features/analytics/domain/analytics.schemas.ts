import { z } from "zod";

export const deviceTypeSchema = z.enum(["mobile", "tablet", "desktop", "unknown"]);

export const recordStorefrontSessionSchema = z.object({
  sessionKey: z.string().min(1).max(128),
  deviceType: deviceTypeSchema.default("unknown"),
  dwellTimeSeconds: z.number().int().min(0).max(86400),
  categoryDwellMap: z.record(z.string(), z.number().int().nonnegative()).default({}),
  itemViewsMap: z.record(z.string(), z.number().int().nonnegative()).default({}),
  cartCreated: z.boolean().default(false),
  orderPlaced: z.boolean().default(false),
  associatedOrderId: z.string().uuid().optional().nullable(),
});

export type RecordStorefrontSessionInput = z.infer<typeof recordStorefrontSessionSchema>;

export const analyticsDateFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
  categoryId: z.string().uuid().optional(),
  source: z.enum(["all", "mercadopago_webhook", "admin_direct"]).default("all"),
});

export type AnalyticsDateFilterInput = z.infer<typeof analyticsDateFilterSchema>;
