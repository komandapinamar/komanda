import { z } from "zod";

export const kioskPaymentItemSchema = z.object({
  catalogItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const createKioskPaymentSessionSchema = z.object({
  items: z.array(kioskPaymentItemSchema).min(1),
  customer: z
    .object({
      name: z.string().min(1).default("Cliente Autoservicio"),
      email: z.string().email().optional(),
    })
    .default({ name: "Cliente Autoservicio" }),
  notes: z.string().max(255).optional(),
  discountCode: z.string().trim().max(50).optional(),
});

export type CreateKioskPaymentSessionRequest = z.infer<
  typeof createKioskPaymentSessionSchema
>;

export const kioskDiscountPreviewSchema = z.object({
  items: z.array(kioskPaymentItemSchema).min(1),
  discountCode: z.string().trim().min(1).max(50),
  tender: z.enum(["cash", "posnet", "mercadopago"]).optional(),
});

export type KioskDiscountPreviewRequest = z.infer<
  typeof kioskDiscountPreviewSchema
>;

export type KioskDiscountPreviewResponse = {
  eligible: boolean;
  reason: string | null;
  code: string;
  name: string | null;
  subtotal: string;
  discountTotal: string;
  total: string;
  applicableTender: "all" | "cash" | null;
};

export type KioskPaymentSessionResponse = {
  paymentAttemptId: string;
  cartId: string;
  total: string;
  currency: string;
  qrData: string;
  expiresAt: string;
  timeoutSeconds: number;
};
