import { describe, expect, it, vi, beforeEach } from "vitest";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

const mockTransaction = {
  select: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_ctx, cb) => cb(mockTransaction)),
}));

import { CartService, CartRevalidationError } from "@/features/cart/application/cart.service";
import {
  PaymentSessionService,
  PaymentSessionProviderUnavailableError,
} from "@/features/payments/application/payment-session.service";

describe("ordering and payment gating lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CartService.create rejects when ordering is unavailable (MP revoked)", async () => {
    const mockTenants = {
      resolve: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        name: "Resto",
        slug: "resto",
        currency: "ARS",
        locationId: "00000000-0000-4000-8000-000000000002",
      }),
    };

    // Mock the queries inside fetchTenantReadiness:
    // 1: tenant (active)
    // 2: location (active)
    // 3: publishedItem (active)
    // 4: paymentIntegration (empty -> MP revoked!)
    // 5: settings (salesEnabled: true)
    mockTransaction.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              {
                id: "00000000-0000-4000-8000-000000000001",
                name: "Resto",
                slug: "resto",
                normalizedSlug: "resto",
                defaultCurrency: "ARS",
                status: "active",
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              {
                id: "00000000-0000-4000-8000-000000000002",
                name: "Main",
                address: "Calle 1",
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([{ id: "item1" }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]), // MP revoked / missing
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([{ salesEnabled: true }]),
          }),
        }),
      });

    const cartService = new CartService(mockTenants as any);

    await expect(
      cartService.create(
        "resto",
        {
          lines: [
            {
              kind: "item",
              resourceId: "00000000-0000-4000-8000-000000000003",
              quantity: 1,
            },
          ],
        },
        "idemp-1",
      ),
    ).rejects.toBeInstanceOf(CartRevalidationError);
  });

  it("PaymentSessionService rejects before idempotency replay when Mercado Pago is not connected", async () => {
    const mockPublicTenants = {
      resolve: vi.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        name: "Resto",
        slug: "resto",
        currency: "ARS",
        locationId: "00000000-0000-4000-8000-000000000002",
      }),
    };

    // 1: entitlement query returns online_payments: true
    // 2: currentMercadoPago returns null (revoked or not connected)
    mockTransaction.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              { entitlements: { online_payments: true } },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]), // no active MP account!
          }),
        }),
      });

    const paymentService = new PaymentSessionService(
      mockPublicTenants as any,
      undefined,
      () => new Date(),
    );

    await expect(
      paymentService.create({
        tenantSlug: "resto",
        cartId: "00000000-0000-4000-8000-000000000010",
        idempotencyKey: "idemp-session-1",
        body: { customer: { name: "Test User" } },
        baseUrl: "https://example.com",
        correlationId: "corr-1",
      }),
    ).rejects.toBeInstanceOf(PaymentSessionProviderUnavailableError);
  });

  it("MercadoPagoIntegrationService.revoke returns structured local and remote confirmation outcomes", async () => {
    const { MercadoPagoIntegrationService } = await import(
      "@/features/payments/application/integration.service"
    );

    const mockOAuthClient = {
      revoke: vi.fn().mockResolvedValueOnce({ confirmed: true }).mockResolvedValueOnce({ confirmed: false }),
    };

    const mockContext = createVerifiedTenantContext({
      tenantId: "00000000-0000-4000-8000-000000000001",
      correlationId: "corr-1",
      source: "administrative",
      actor: {
        kind: "user",
        userId: "u1",
        membershipId: "m1",
        role: "owner",
      },
    });

    const account = {
      id: "acc-1",
      tenantId: "00000000-0000-4000-8000-000000000001",
      provider: "mercadopago",
      providerAccountId: "mp-seller-1",
      status: "active",
      version: 1,
      encryptedPayload: Buffer.from("data"),
      encryptionIv: Buffer.from("iv"),
      authTag: Buffer.from("tag"),
      keyVersion: 1,
      scopes: ["read"],
      expiresAt: null,
      lastVerifiedAt: null,
      webhookRoutingKey: "key-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 1st call: remote confirmed = true
    mockTransaction.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          limit: vi.fn().mockResolvedValueOnce([account]),
        }),
      }),
    });
    mockTransaction.update = vi.fn().mockReturnValueOnce({
      set: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([{ ...account, status: "revoked", version: 2 }]),
        }),
      }),
    });

    // Mock decryptTokens
    vi.spyOn(
      (await import("@/features/payments/infrastructure/integration.repository")).IntegrationRepository.prototype,
      "decryptTokens",
    ).mockReturnValue({
      accessToken: "token-1",
      refreshToken: "refresh-1",
      expiresIn: 3600,
      userId: "mp-seller-1",
      scopes: [],
    });

    const service = new MercadoPagoIntegrationService(mockOAuthClient as any);
    const result1 = await service.revoke(mockContext, 1);
    expect(result1).toEqual({
      localRevoked: true,
      remoteConfirmed: true,
      version: 2,
    });

    // 2nd call: remote confirmed = false (e.g. provider returned 404/401)
    mockTransaction.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          limit: vi.fn().mockResolvedValueOnce([account]),
        }),
      }),
    });
    mockTransaction.update = vi.fn().mockReturnValueOnce({
      set: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockReturnValueOnce({
          returning: vi.fn().mockResolvedValueOnce([{ ...account, status: "revoked", version: 2 }]),
        }),
      }),
    });

    const result2 = await service.revoke(mockContext, 1);
    expect(result2).toEqual({
      localRevoked: true,
      remoteConfirmed: false,
      version: 2,
    });
  });
});
