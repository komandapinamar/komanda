import { describe, expect, it, vi } from "vitest";
import { normalizeWhatsAppRecipient } from "@/features/orders/domain/whatsapp-consent";
import { createCashOrderSchema } from "@/features/orders/domain/cash-order.schemas";

describe("optional ready-order WhatsApp notifications", () => {
  it("normalizes Argentine mobile numbers and rejects incomplete numbers", () => {
    expect(normalizeWhatsAppRecipient("11 2345-6789")).toBe("5491123456789");
    expect(normalizeWhatsAppRecipient("+54 9 11 2345-6789")).toBe("5491123456789");
    expect(normalizeWhatsAppRecipient("011 15 2345-6789")).toBe("5491123456789");
    expect(normalizeWhatsAppRecipient("12345")).toBeNull();
  });

  it("accepts checkout without a phone when not opted in; validates opt-in phone", () => {
    expect(createCashOrderSchema.safeParse({ customer: { name: "Ana" } }).success).toBe(true);
    expect(createCashOrderSchema.safeParse({ customer: { name: "Ana", whatsappReadyOptIn: true } }).success).toBe(false);
    expect(createCashOrderSchema.safeParse({ customer: { name: "Ana", phone: "11 2345 6789", whatsappReadyOptIn: true } }).success).toBe(true);
  });

  it("sends Meta an approved template for the opted-in recipient", async () => {
    vi.stubEnv("KOMANDA_WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("KOMANDA_WHATSAPP_PHONE_NUMBER_ID", "12345");
    vi.stubEnv("KOMANDA_WHATSAPP_READY_TEMPLATE", "komanda_order_ready");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    try {
      const { sendReadyWhatsApp } = await import("@/features/orders/infrastructure/whatsapp.client");
      await sendReadyWhatsApp("5491123456789", "1084");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://graph.facebook.com/v23.0/12345/messages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            messaging_product: "whatsapp", to: "5491123456789", type: "template",
            template: { name: "komanda_order_ready", language: { code: "es_AR" },
              components: [{ type: "body", parameters: [{ type: "text", text: "1084" }] }] },
          }),
        }),
      );
    } finally {
      fetchMock.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("sends the owner template with four positional es_AR variables", async () => {
    vi.stubEnv("KOMANDA_WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("KOMANDA_WHATSAPP_PHONE_NUMBER_ID", "12345");
    vi.stubEnv("KOMANDA_WHATSAPP_OWNER_CASH_TEMPLATE", "komanda_owner_cash_pending");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    try {
      const { sendOwnerCashPendingWhatsApp } = await import("@/features/orders/infrastructure/whatsapp.client");
      await sendOwnerCashPendingWhatsApp({ phone: "5491123456789", business: "Kiosco", purchaseNumber: "1084", amount: "$1250 ARS", items: "2× Yerba" });
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/12345/messages"), expect.objectContaining({
        body: JSON.stringify({
          messaging_product: "whatsapp", to: "5491123456789", type: "template",
          template: { name: "komanda_owner_cash_pending", language: { code: "es_AR" }, components: [{ type: "body", parameters: ["Kiosco", "1084", "$1250 ARS", "2× Yerba"].map(text => ({ type: "text", text })) }] },
        }),
      }));
    } finally {
      fetchMock.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("fails safely when the owner template is not configured", async () => {
    vi.stubEnv("KOMANDA_WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("KOMANDA_WHATSAPP_PHONE_NUMBER_ID", "12345");
    vi.stubEnv("KOMANDA_WHATSAPP_OWNER_CASH_TEMPLATE", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      const { sendOwnerCashPendingWhatsApp } = await import("@/features/orders/infrastructure/whatsapp.client");
      await expect(sendOwnerCashPendingWhatsApp({
        phone: "5491123456789", business: "Kiosco", purchaseNumber: "1084", amount: "1250.00 ARS", items: "Yerba",
      })).rejects.toThrow("WhatsApp is not configured.");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
