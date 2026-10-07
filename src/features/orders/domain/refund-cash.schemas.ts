import { z } from "zod";

export const refundCashSchema = z
  .object({
    reason: z.string().trim().min(1),
    operatorNote: z.string().trim().max(1000).optional(),
  })
  .strict();

export type RefundCashRequest = z.infer<typeof refundCashSchema>;

export type RefundCashResponse = {
  orderId: string;
  paymentStatus: "refunded";
  fulfillmentStatus: "cancelled";
  refundedAt: string;
  cashMovementId: string | null;
  version: number;
};
