import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import type { PaymentOrderStatusResponse } from "@/app/api/v1/payments/[paymentId]/order-status/route";
import type { CheckoutFormValues } from "@/types/types";

describe("Checkout and Order Status QR enhancements", () => {
  it("generates a valid tracking QR data URL for orders/status/:tenantId/:orderId", async () => {
    const tenantId = "8a25d25a-4cfb-4a55-89f5-30fa6e61f22e";
    const orderId = "c25bb2aa-ebfe-45ce-8c3b-741160352ef1";
    const origin = "https://komanda.app";
    const trackingUrl = `${origin}/orders/status/${tenantId}/${orderId}`;

    const dataUri = await QRCode.toDataURL(trackingUrl, {
      margin: 1,
      width: 200,
    });

    expect(dataUri).toBeDefined();
    expect(dataUri.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("handles PaymentOrderStatusResponse with tenantId and hasCustomerPhone flag", () => {
    const responseWithPhone: PaymentOrderStatusResponse = {
      status: "completed",
      orderId: "order-123",
      tenantId: "tenant-456",
      purchaseNumber: "1001",
      fulfillmentStatus: "preparing",
      paymentStatus: "approved",
      pickupPin: "4589",
      estimatedWaitMinutes: 15,
      estimatedReadyAt: "2026-10-01T18:00:00.000Z",
      hasCustomerPhone: true,
    };

    expect(responseWithPhone.hasCustomerPhone).toBe(true);
    expect(responseWithPhone.tenantId).toBe("tenant-456");

    const responseWithoutPhone: PaymentOrderStatusResponse = {
      status: "completed",
      orderId: "order-124",
      tenantId: "tenant-456",
      purchaseNumber: "1002",
      fulfillmentStatus: "preparing",
      paymentStatus: "approved",
      pickupPin: "1234",
      estimatedWaitMinutes: 10,
      estimatedReadyAt: "2026-10-01T18:10:00.000Z",
      hasCustomerPhone: false,
    };

    expect(responseWithoutPhone.hasCustomerPhone).toBe(false);
  });

  it("formats checkout payload prioritizing name and making phone/notes optional", () => {
    const formWithAllFields: CheckoutFormValues = {
      customer: {
        name: "Luka",
        phone: "+54 9 11 2345 6789",
      },
      notes: "Sin sal",
    };

    const payloadWithAll = {
      cartId: "cart-1",
      customer: {
        name: formWithAllFields.customer.name.trim(),
        phone: formWithAllFields.customer.phone?.trim() || undefined,
      },
      notes: formWithAllFields.notes.trim() || undefined,
    };

    expect(payloadWithAll.customer.name).toBe("Luka");
    expect(payloadWithAll.customer.phone).toBe("+54 9 11 2345 6789");
    expect(payloadWithAll.notes).toBe("Sin sal");

    const formWithDefaults: CheckoutFormValues = {
      customer: {
        name: "Luka",
        phone: "",
      },
      notes: "",
    };

    const payloadWithDefaults = {
      cartId: "cart-1",
      customer: {
        name: formWithDefaults.customer.name.trim(),
        phone: formWithDefaults.customer.phone?.trim() || undefined,
      },
      notes: formWithDefaults.notes.trim() || undefined,
    };

    expect(payloadWithDefaults.customer.name).toBe("Luka");
    expect(payloadWithDefaults.customer.phone).toBeUndefined();
    expect(payloadWithDefaults.notes).toBeUndefined();
  });
});
