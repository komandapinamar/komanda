import { describe, expect, it, vi, beforeEach } from "vitest";
import { withTenantTransaction } from "@/db/tenant-transaction";
import {
  createKioskPaymentSessionSchema,
  type KioskPaymentSessionResponse,
} from "@/features/payments/domain/kiosk-payment.schemas";
import {
  kioskPaymentErrorResponse,
  PaymentGatewayNotConfiguredError,
  KioskPaymentCartUnavailableError,
  KioskPaymentItemUnavailableError,
} from "@/features/payments/web/kiosk-payment-http";
import { KioskPaymentService } from "@/features/payments/application/kiosk-payment.service";
import type { TenantContext } from "@/lib/tenant-context/types";

// Mock db and transaction
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
  runtimePool: {},
}));

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_context, callback) => callback({})),
}));

// Mock repositories and services used by KioskPaymentService
const mockCurrentMercadoPago = vi.fn();
const mockDecryptTokens = vi.fn();
const mockCreatePaymentAttempt = vi.fn();
const mockAttachPreference = vi.fn();

vi.mock("@/features/payments/infrastructure/integration.repository", () => {
  return {
    IntegrationRepository: vi.fn().mockImplementation(function () {
      return {
        currentMercadoPago: mockCurrentMercadoPago,
        decryptTokens: mockDecryptTokens,
        createPaymentAttempt: mockCreatePaymentAttempt,
        attachPreference: mockAttachPreference,
      };
    }),
  };
});

const mockIdempotencyClaim = vi.fn();
const mockIdempotencyComplete = vi.fn();
const mockIdempotencyFail = vi.fn();

vi.mock("@/lib/idempotency/idempotency.service", () => {
  return {
    IdempotencyService: vi.fn().mockImplementation(function () {
      return {
        claim: mockIdempotencyClaim,
        complete: mockIdempotencyComplete,
        fail: mockIdempotencyFail,
      };
    }),
  };
});

const mockLoadSelection = vi.fn();
const mockCartCreate = vi.fn();

vi.mock("@/features/cart/infrastructure/cart.repository", () => {
  return {
    CartRepository: vi.fn().mockImplementation(function () {
      return {
        loadSelection: mockLoadSelection,
        create: mockCartCreate,
      };
    }),
  };
});

describe("Story 2.1: Kiosk Payment Session Domain & HTTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Zod Validation Schema (createKioskPaymentSessionSchema)", () => {
    it("accepts valid kiosk payment session request", () => {
      const valid = {
        items: [
          {
            catalogItemId: "11111111-1111-4111-8111-111111111111",
            quantity: 2,
          },
        ],
        customer: {
          name: "Martín Autoservicio",
        },
      };

      const parsed = createKioskPaymentSessionSchema.parse(valid);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.customer.name).toBe("Martín Autoservicio");
    });

    it("rejects empty items array", () => {
      expect(() =>
        createKioskPaymentSessionSchema.parse({
          items: [],
        }),
      ).toThrow();
    });

    it("rejects invalid UUIDs or negative quantities", () => {
      expect(() =>
        createKioskPaymentSessionSchema.parse({
          items: [{ catalogItemId: "not-a-uuid", quantity: 1 }],
        }),
      ).toThrow();

      expect(() =>
        createKioskPaymentSessionSchema.parse({
          items: [
            {
              catalogItemId: "11111111-1111-4111-8111-111111111111",
              quantity: 0,
            },
          ],
        }),
      ).toThrow();
    });
  });

  describe("HTTP Error Responses (kioskPaymentErrorResponse)", () => {
    it("maps PaymentGatewayNotConfiguredError to HTTP 422 with RFC 7807 problem details", async () => {
      const error = new PaymentGatewayNotConfiguredError();
      const response = kioskPaymentErrorResponse(error, "corr-123");

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("PAYMENT_GATEWAY_NOT_CONFIGURED");
      expect(body.title).toBe("Mercado Pago no configurado");
      expect(body.correlationId).toBe("corr-123");
    });

    it("maps KioskPaymentItemUnavailableError to HTTP 409", async () => {
      const error = new KioskPaymentItemUnavailableError(
        "Product is unavailable.",
      );
      const response = kioskPaymentErrorResponse(error, "corr-456");

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe("PAYMENT_ITEMS_CONFLICT");
      expect(body.detail).toBe("Product is unavailable.");
    });
  });

  describe("KioskPaymentService application logic", () => {
    const mockContext: TenantContext = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      locationId: "00000000-0000-4000-8000-000000000002",
      correlationId: "corr-kiosk-test",
      source: "terminal",
      actor: { kind: "system", systemId: "kiosk-terminal-1" },
    };

    it("throws PaymentGatewayNotConfiguredError if tenant has no active Mercado Pago account", async () => {
      mockCurrentMercadoPago.mockResolvedValueOnce(null);

      const service = new KioskPaymentService();

      await expect(
        service.createSession({
          context: mockContext,
          body: {
            items: [
              {
                catalogItemId: "11111111-1111-4111-8111-111111111111",
                quantity: 1,
              },
            ],
          },
          idempotencyKey: "idem-key-1",
          baseUrl: "https://kiosk.komanda.test",
        }),
      ).rejects.toThrow(PaymentGatewayNotConfiguredError);
    });

    it("replays idempotency claim when already completed", async () => {
      const existingResponse: KioskPaymentSessionResponse = {
        paymentAttemptId: "att-123",
        cartId: "cart-123",
        total: "3500.00",
        currency: "ARS",
        qrData: "https://mercadopago.com/init_point_cached",
        expiresAt: "2026-09-23T16:02:00.000Z",
        timeoutSeconds: 120,
      };

      mockCurrentMercadoPago.mockResolvedValueOnce({
        id: "acc-1",
        status: "active",
      });
      mockIdempotencyClaim.mockResolvedValueOnce({
        replayed: true,
        status: 201,
        body: existingResponse,
      });

      const service = new KioskPaymentService();
      const result = await service.createSession({
        context: mockContext,
        body: {
          items: [
            {
              catalogItemId: "11111111-1111-4111-8111-111111111111",
              quantity: 1,
            },
          ],
        },
        idempotencyKey: "idem-key-replay",
        baseUrl: "https://kiosk.komanda.test",
      });

      expect(result).toEqual(existingResponse);
      expect(mockCartCreate).not.toHaveBeenCalled();
    });

    it("creates full kiosk payment session with 120s TTL and QR preference", async () => {
      mockCurrentMercadoPago.mockResolvedValueOnce({
        id: "acc-1",
        status: "active",
        webhookRoutingKey: "routing-key-1",
      });

      mockIdempotencyClaim.mockResolvedValueOnce({
        replayed: false,
        recordId: "claim-rec-1",
        requestHash: "hash-1",
      });

      mockDecryptTokens.mockReturnValueOnce({
        accessToken: "TEST-TOKEN",
      });

      mockLoadSelection.mockResolvedValueOnce({
        id: "11111111-1111-4111-8111-111111111111",
        currency: "ARS",
        name: "Coca-Cola 500ml",
        price: "1500.00",
        status: "active",
        addonGroups: [],
        imageUrl: null,
      });

      mockCartCreate.mockImplementationOnce(async (args) => ({
        id: "cart-uuid-1",
        total: args.total,
        currency: args.currency,
        expiresAt: args.expiresAt,
        lines: args.lines,
      }));

      mockCreatePaymentAttempt.mockResolvedValueOnce({
        id: "att-uuid-1",
      });

      const mockMpClient = {
        createPreference: vi.fn().mockResolvedValueOnce({
          preferenceId: "pref-101",
          redirectUrl: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-101",
        }),
      };

      // Mock database selects for tenant currency and primary location
      vi.mocked(withTenantTransaction).mockImplementationOnce(async (_ctx, callback) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValueOnce([{ currency: "ARS" }])
                  .mockResolvedValueOnce([{ id: "loc-1" }]),
              }),
            }),
          }),
        };
        return callback(tx as any);
      });

      const service = new KioskPaymentService(mockMpClient as any);
      const result = await service.createSession({
        context: mockContext,
        body: {
          items: [
            {
              catalogItemId: "11111111-1111-4111-8111-111111111111",
              quantity: 2,
            },
          ],
          customer: { name: "Cliente Autoservicio" },
        },
        idempotencyKey: "idem-key-new",
        baseUrl: "https://kiosk.komanda.test",
      });

      expect(result.paymentAttemptId).toBe("att-uuid-1");
      expect(result.total).toBe("3000.00");
      expect(result.currency).toBe("ARS");
      expect(result.qrData).toContain("pref-101");
      expect(result.timeoutSeconds).toBe(120);
      expect(mockAttachPreference).toHaveBeenCalledWith({
        attemptId: "att-uuid-1",
        integrationAccountId: "acc-1",
        preferenceId: "pref-101",
      });
      expect(mockIdempotencyComplete).toHaveBeenCalledWith("claim-rec-1", 201, result);
    });

    it("cancels pending payment attempt idempotently", async () => {
      mockIdempotencyClaim.mockResolvedValueOnce({
        replayed: false,
        recordId: "cancel-claim-1",
        requestHash: "cancel-hash-1",
      });

      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      vi.mocked(withTenantTransaction).mockImplementationOnce(async (_ctx, callback) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValueOnce([
                  {
                    id: "att-cancel-1",
                    tenantId: mockContext.tenantId,
                    status: "pending",
                  },
                ]),
              }),
            }),
          }),
          update: mockUpdate,
        };
        return callback(tx as any);
      });

      const service = new KioskPaymentService();
      const result = await service.cancelAttempt({
        context: mockContext,
        attemptId: "att-cancel-1",
        idempotencyKey: "idem-cancel-key",
      });

      expect(result.status).toBe("cancelled");
      expect(result.cancelledAt).toBeDefined();
      expect(mockIdempotencyComplete).toHaveBeenCalledWith("cancel-claim-1", 200, result);
    });
  });
});
