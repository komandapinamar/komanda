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
});
