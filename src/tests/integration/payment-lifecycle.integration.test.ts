import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn(),
}));

const cart = {
  id: "00000000-0000-4000-8000-000000000001",
  tenantId: "00000000-0000-4000-8000-000000000002",
  locationId: "00000000-0000-4000-8000-000000000003",
  status: "validated" as const,
  currency: "ARS",
  subtotal: "1000.00",
  discountTotal: "0.00",
  total: "1000.00",
  catalogRevision: 1,
  verifiedAt: new Date("2026-07-05T12:00:00.000Z"),
  expiresAt: new Date("2026-07-05T12:15:00.000Z"),
  version: 1,
  createdAt: new Date("2026-07-05T12:00:00.000Z"),
  updatedAt: new Date("2026-07-05T12:00:00.000Z"),
  lines: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      tenantId: "00000000-0000-4000-8000-000000000002",
      cartId: "00000000-0000-4000-8000-000000000001",
      itemId: "20000000-0000-4000-8000-000000000001",
      comboId: null,
      quantity: 1,
      nameSnapshot: "Burger",
      unitPriceSnapshot: "1000.00",
      lineTotal: "1000.00",
      imageUrlSnapshot: null,
      note: null,
      createdAt: new Date("2026-07-05T12:00:00.000Z"),
      options: [],
    },
  ],
};

describe("payment lifecycle", () => {
  it("maps provider failures and malformed preference responses to a retryable dependency error", async () => {
    const {
      MercadoPagoCheckoutClient,
      PaymentSessionProviderUnavailableError,
    } = await import("@/features/shop/payments/application/payment-session.service");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 504 })));

    await expect(
      new MercadoPagoCheckoutClient().createPreference({
        accessToken: "seller-token",
        paymentAttemptId: "30000000-0000-4000-8000-000000000001",
        routingKey: "40000000-0000-4000-8000-000000000001",
        cart,
        customer: { name: "Ada Lovelace" },
        baseUrl: "https://store.example.test",
      }),
    ).rejects.toBeInstanceOf(PaymentSessionProviderUnavailableError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "pref-without-url" })),
    );
    await expect(
      new MercadoPagoCheckoutClient().createPreference({
        accessToken: "seller-token",
        paymentAttemptId: "30000000-0000-4000-8000-000000000002",
        routingKey: "40000000-0000-4000-8000-000000000001",
        cart,
        customer: { name: "Ada Lovelace" },
        baseUrl: "https://store.example.test",
      }),
    ).rejects.toBeInstanceOf(PaymentSessionProviderUnavailableError);
  });

  it("keeps payment sessions OAuth-only and deny-by-default on online_payments", async () => {
    const source = await readFile(
      "features/shop/payments/application/payment-session.service.ts",
      "utf8",
    );

    expect(source).toContain("hasOnlinePaymentsEntitlement");
    expect(source).toContain("currentMercadoPago");
    expect(source).toContain("decryptTokens(account)");
    expect(source).toContain("PaymentAttemptIdempotencyConflictError");
    expect(source).not.toContain("MP_ACCESS_TOKEN");
  });

  it("scopes persisted payment idempotency to a single tenant cart", async () => {
    const [schemaSource, migrationSource, repositorySource] = await Promise.all([
      readFile("db/schema/commerce.ts", "utf8"),
      readFile("drizzle/0008_multitenant_payments.sql", "utf8"),
      readFile("features/payments/infrastructure/integration.repository.ts", "utf8"),
    ]);

    expect(schemaSource).toContain(
      "payment_attempts_tenant_idempotency_key",
    );
    expect(migrationSource).toContain(
      'UNIQUE ("tenant_id", "idempotency_key")',
    );
    expect(repositorySource).toContain("Idempotency key belongs to another cart");
  });
});
