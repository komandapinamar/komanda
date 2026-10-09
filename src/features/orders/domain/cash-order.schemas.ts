import { z } from "zod";
import { normalizeWhatsAppRecipient } from "@/features/orders/domain/whatsapp-consent";

const optionalTrimmedString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z.string().trim().optional(),
);

export const createCashOrderSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1, "El nombre del cliente es obligatorio."),
        phone: optionalTrimmedString,
        whatsappReadyOptIn: z.boolean().optional(),
      })
      .strict()
      .refine(customer => !customer.whatsappReadyOptIn || !!normalizeWhatsAppRecipient(customer.phone), {
        message: "Ingresá un celular válido para recibir avisos por WhatsApp.",
        path: ["phone"],
      }),
    notes: optionalTrimmedString,
    cartVersion: z.number().int().positive().optional(),
  })
  .strict();

export type CreateCashOrderRequest = z.infer<typeof createCashOrderSchema>;

export type CreateCashOrderResponse = {
  orderId: string;
  tenantId?: string;
  purchaseNumber: string;
  pickupPin: string;
  total: string;
  paymentStatus: "pending";
  expiresAt: string;
  secondsRemaining: number;
};
