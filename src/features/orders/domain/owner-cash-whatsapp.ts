import { normalizeWhatsAppRecipient } from "@/features/orders/domain/whatsapp-consent";

export function normalizeOwnerCashAlertPhone(preset: string, phone: string | null | undefined) {
  if (phone == null) return null;
  const normalized = normalizeWhatsAppRecipient(phone);
  if (preset !== "express_retail" || !normalized) {
    throw new Error("A valid Argentine mobile is required for Express tenants.");
  }
  return normalized;
}

export function canNotifyOwnerOfCashOrder(input: {
  preset: string | null | undefined;
  phone: string | null | undefined;
  tender: string | null | undefined;
  paymentStatus: string | null | undefined;
}) {
  return input.preset === "express_retail" &&
    input.tender === "cash" &&
    input.paymentStatus === "pending" &&
    normalizeWhatsAppRecipient(input.phone) !== null;
}
