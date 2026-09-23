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
});

export type CreateKioskPaymentSessionRequest = z.infer<
  typeof createKioskPaymentSessionSchema
>;

export type KioskPaymentSessionResponse = {
  paymentAttemptId: string;
  cartId: string;
  total: string;
  currency: string;
  qrData: string;
  expiresAt: string;
  timeoutSeconds: number;
};
