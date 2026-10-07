import { z } from "zod";

export const cancelUnpaidOrderSchema = z
  .object({
    pickupPin: z.preprocess(
      (value) => (typeof value === "number" ? String(value) : value),
      z
        .string()
        .trim()
        .regex(/^\d{4}$/, "El PIN de retiro debe contener exactamente 4 dígitos."),
    ),
  })
  .strict();

export type CancelUnpaidOrderRequest = z.infer<typeof cancelUnpaidOrderSchema>;

export type CancelUnpaidOrderResponse = {
  orderId: string;
  fulfillmentStatus: "cancelled";
  paymentStatus: string;
  cancelledAt: string;
};
