import { z } from "zod";

export const collectCashSchema = z
  .object({
    authMethod: z.enum(["pickup_pin", "account_auth"]),
    authCode: z
      .preprocess(
        (value) => (value === null ? undefined : typeof value === "number" ? String(value) : value),
        z.string().trim().optional(),
      ),
  })
  .strict()
  .refine(
    (data) => {
      if (data.authMethod === "pickup_pin") {
        return Boolean(data.authCode && data.authCode.length > 0);
      }
      return true;
    },
    {
      message: "authCode es requerido cuando authMethod es 'pickup_pin'.",
      path: ["authCode"],
    },
  );

export type CollectCashRequest = z.infer<typeof collectCashSchema>;

export type CollectCashResponse = {
  orderId: string;
  purchaseNumber: string;
  paymentStatus: "paid";
  paidAt: string;
  version: number;
};
