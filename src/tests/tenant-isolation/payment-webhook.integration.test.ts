import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InvalidMercadoPagoWebhookError,
  parseSanitizedMercadoPagoWebhook,
  verifyMercadoPagoWebhook,
} from "@/features/payments/infrastructure/mercadopago-webhook.verifier";

describe("Mercado Pago webhook boundary", () => {
  it("requires the exact request, resource and signature tuple", () => {
    const secret = "webhook-test-secret";
    const timestamp = "1783292000";
    const requestId = "request-a";
    const dataId = "payment-1";
    const digest = createHmac("sha256", secret)
      .update(`id:${dataId};request-id:${requestId};ts:${timestamp};`)
      .digest("hex");
    expect(() =>
      verifyMercadoPagoWebhook({
        signature: `ts=${timestamp},v1=${digest}`,
        requestId,
        dataId,
        secret,
      }),
    ).not.toThrow();
    expect(() =>
      verifyMercadoPagoWebhook({
        signature: `ts=${timestamp},v1=${digest}`,
        requestId: "foreign-request",
        dataId,
        secret,
      }),
    ).toThrow(InvalidMercadoPagoWebhookError);
  });

  it("keeps only routing fields from provider payloads", () => {
    expect(
      parseSanitizedMercadoPagoWebhook({
        id: "event-1",
        type: "payment",
        action: "payment.updated",
        data: { id: "payment-1" },
        access_token: "must-not-survive",
        payer: { email: "customer@example.test" },
      }),
    ).toEqual({
      providerEventId: "event-1",
      resourceId: "payment-1",
      topic: "payment",
      action: "payment.updated",
    });
  });
});
