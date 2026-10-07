import { describe, expect, it, vi, beforeEach } from "vitest";
import { tenantOrders } from "@/db/schema/commerce";
import {
  createCashOrderSchema,
  type CreateCashOrderResponse,
} from "@/features/orders/domain/cash-order.schemas";
import {
  CreateCashOrderService,
  OrderingNotSupportedError,
  BusinessClosedError,
  CashOrderCartUnavailableError,
} from "@/features/orders/application/create-cash-order.service";
import {
  POST,
  cashOrderErrorResponse,
} from "@/app/api/v1/storefronts/[tenantSlug]/carts/[cartId]/cash-orders/route";
import { PublicTenantService, type PublicTenant } from "@/features/tenancy/application/public-tenant.service";
import { OrderConflictError } from "@/features/orders/application/order-errors";

// Set required base URL
process.env.KOMANDA_PUBLIC_BASE_URL = "https://komanda.app";

// Mock transaction and db
const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
const mockTx = {
  select: mockSelect,
};

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_context, callback) => callback(mockTx)),
}));

// Mock repositories and services
const mockCartFind = vi.fn();
vi.mock("@/features/cart/infrastructure/cart.repository", () => ({
  CartRepository: vi.fn().mockImplementation(function () {
    return {
      find: mockCartFind,
    };
  }),
}));

const mockCreateFromCartSnapshot = vi.fn();
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: vi.fn().mockImplementation(function () {
    return {
      createFromCartSnapshot: mockCreateFromCartSnapshot,
    };
  }),
}));

const mockIdempotencyClaim = vi.fn();
const mockIdempotencyComplete = vi.fn();
vi.mock("@/lib/idempotency/idempotency.service", () => ({
  IdempotencyService: vi.fn().mockImplementation(function () {
    return {
      claim: mockIdempotencyClaim,
      complete: mockIdempotencyComplete,
    };
  }),
  IdempotencyConflictError: class IdempotencyConflictError extends Error {},
  IdempotencyInProgressError: class IdempotencyInProgressError extends Error {},
}));

describe("Story 1.1: Storefront Cash Orders Endpoint & Persistence", () => {
  const fixedNow = new Date("2026-10-05T12:00:00.000Z");

  const standardCart = {
    id: "cart-00000000-0000-4000-8000-000000000001",
    tenantId: "tenant-0000-0000-4000-8000-000000000001",
    locationId: "loc-00000000-0000-4000-8000-000000000001",
    status: "validated" as const,
    currency: "ARS",
    subtotal: "3500.00",
    discountTotal: "0",
    total: "3500.00",
    version: 1,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lines: [
      {
        id: "line-1",
        itemId: "item-1",
        comboId: null,
        nameSnapshot: "Burger Clásica",
        quantity: 1,
        unitPriceSnapshot: "3500.00",
        lineTotal: "3500.00",
        imageUrlSnapshot: null,
        note: null,
        options: [],
      },
    ],
  };

  const standardPublicTenant: PublicTenant = {
    id: "tenant-0000-0000-4000-8000-000000000001",
    name: "Burger Joint",
    slug: "burger-joint",
    currency: "ARS",
    locationId: "loc-00000000-0000-4000-8000-000000000001",
    preset: "gastronomy",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([{ salesEnabled: true }]);
    mockCartFind.mockResolvedValue(standardCart);
    mockIdempotencyClaim.mockResolvedValue({
      replayed: false,
      recordId: "idemp-rec-1",
      requestHash: "hash-1",
    });
    mockCreateFromCartSnapshot.mockResolvedValue({
      order: {
        id: "ord-00000000-0000-4000-8000-000000000001",
        purchaseNumber: "1084",
        pickupPin: "7428",
        total: "3500.00",
        paymentStatus: "pending",
        paymentExpiresAt: new Date(fixedNow.getTime() + 60 * 60 * 1000).toISOString(),
      },
      created: true,
    });
  });

  describe("Schema & Model Invariants", () => {
    it("tenantOrders schema defines paymentExpiresAt column", () => {
      expect(tenantOrders.paymentExpiresAt).toBeDefined();
      expect(tenantOrders.pickupPin).toBeDefined();
    });

    it("createCashOrderSchema accepts valid minimal input", () => {
      const parsed = createCashOrderSchema.parse({
        customer: { name: "Luka Modric" },
      });
      expect(parsed.customer.name).toBe("Luka Modric");
      expect(parsed.customer.phone).toBeUndefined();
      expect(parsed.notes).toBeUndefined();
      expect(parsed.cartVersion).toBeUndefined();
    });

    it("createCashOrderSchema accepts complete input with phone, notes and cartVersion", () => {
      const parsed = createCashOrderSchema.parse({
        customer: { name: "Luka Modric", phone: "1122334455" },
        notes: "Sin condimentos",
        cartVersion: 3,
      });
      expect(parsed.customer.name).toBe("Luka Modric");
      expect(parsed.customer.phone).toBe("1122334455");
      expect(parsed.notes).toBe("Sin condimentos");
      expect(parsed.cartVersion).toBe(3);
    });

    it("createCashOrderSchema rejects empty or whitespace-only customer name", () => {
      expect(() =>
        createCashOrderSchema.parse({
          customer: { name: "   " },
        }),
      ).toThrow();
    });

    it("createCashOrderSchema rejects missing customer", () => {
      expect(() => createCashOrderSchema.parse({})).toThrow();
    });

    it("createCashOrderSchema rejects unknown fields (strict mode)", () => {
      expect(() =>
        createCashOrderSchema.parse({
          customer: { name: "Valido", extraField: "hack" },
        }),
      ).toThrow();
    });

    it("createCashOrderSchema normalizes empty string phone and notes to undefined", () => {
      const parsed = createCashOrderSchema.parse({
        customer: { name: "Valido", phone: "   " },
        notes: "",
      });
      expect(parsed.customer.phone).toBeUndefined();
      expect(parsed.notes).toBeUndefined();
    });
  });

  describe("CreateCashOrderService Application Logic", () => {
    it("creates cash order with pending status, 4-digit pickup PIN, and 60-minute TTL", async () => {
      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      const result = await service.create({
        tenantSlug: "burger-joint",
        cartId: standardCart.id,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        body: {
          customer: { name: "Comensal Feliz" },
        },
      });

      expect(result.orderId).toBe("ord-00000000-0000-4000-8000-000000000001");
      expect(result.purchaseNumber).toBe("1084");
      expect(result.paymentStatus).toBe("pending");
      expect(result.total).toBe("3500.00");
      expect(result.pickupPin).toMatch(/^\d{4}$/);
      expect(result.secondsRemaining).toBe(3600);
      expect(result.expiresAt).toBe(new Date("2026-10-05T13:00:00.000Z").toISOString());

      expect(mockCreateFromCartSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "storefront_cash",
          tender: "cash",
          paymentStatus: "pending",
          customer: { name: "Comensal Feliz", phone: undefined },
          pickupPin: expect.stringMatching(/^\d{4}$/),
          paymentExpiresAt: new Date("2026-10-05T13:00:00.000Z"),
        }),
      );

      expect(mockIdempotencyComplete).toHaveBeenCalledWith(
        "idemp-rec-1",
        201,
        expect.objectContaining({
          orderId: "ord-00000000-0000-4000-8000-000000000001",
          paymentStatus: "pending",
        }),
      );
    });

    it("throws OrderingNotSupportedError when tenant preset is express_retail", async () => {
      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue({
          ...standardPublicTenant,
          preset: "express_retail",
        }),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      await expect(
        service.create({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Comensal Express" },
          },
        }),
      ).rejects.toThrow(OrderingNotSupportedError);
    });

    it("throws BusinessClosedError when tenant has salesEnabled: false", async () => {
      mockLimit.mockResolvedValueOnce([{ salesEnabled: false }]);
      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      await expect(
        service.create({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Comensal Tarde" },
          },
        }),
      ).rejects.toThrow(BusinessClosedError);
    });

    it("returns replayed response directly when idempotency claim is already completed", async () => {
      const cachedResponse: CreateCashOrderResponse = {
        orderId: "ord-cached-1",
        purchaseNumber: "1001",
        pickupPin: "4444",
        total: "3500.00",
        paymentStatus: "pending",
        expiresAt: "2026-10-05T13:00:00.000Z",
        secondsRemaining: 3600,
      };

      mockIdempotencyClaim.mockResolvedValueOnce({
        replayed: true,
        status: 201,
        body: cachedResponse,
      });

      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      const result = await service.create({
        tenantSlug: "burger-joint",
        cartId: standardCart.id,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        body: {
          customer: { name: "Comensal Repetido" },
        },
      });

      expect(result).toEqual(cachedResponse);
      expect(mockCreateFromCartSnapshot).not.toHaveBeenCalled();
    });

    it("throws OrderConflictError when cart is already converted", async () => {
      mockCartFind.mockResolvedValueOnce({
        ...standardCart,
        status: "converted",
      });

      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      await expect(
        service.create({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Comensal Duplicado" },
          },
        }),
      ).rejects.toThrow(OrderConflictError);
    });

    it("throws OrderConflictError on cartVersion mismatch", async () => {
      mockCartFind.mockResolvedValueOnce({
        ...standardCart,
        version: 1,
      });

      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      await expect(
        service.create({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Comensal Desfasado" },
            cartVersion: 2, // version in cart is 1
          },
        }),
      ).rejects.toThrow(OrderConflictError);
    });

    it("throws CashOrderCartUnavailableError when cart is not found", async () => {
      mockCartFind.mockResolvedValueOnce(null);

      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      await expect(
        service.create({
          tenantSlug: "burger-joint",
          cartId: "cart-inexistente",
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Comensal Fantasma" },
          },
        }),
      ).rejects.toThrow(CashOrderCartUnavailableError);
    });

    it("throws CashOrderCartUnavailableError when cart timestamp has expired", async () => {
      mockCartFind.mockResolvedValueOnce({
        ...standardCart,
        expiresAt: new Date(fixedNow.getTime() - 1000),
      });

      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      await expect(
        service.create({
          tenantSlug: "burger-joint",
          cartId: "cart-1",
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Comensal Tardío" },
          },
        }),
      ).rejects.toThrow(CashOrderCartUnavailableError);
    });

    it("throws CashOrderCartUnavailableError when cart status is expired", async () => {
      mockCartFind.mockResolvedValueOnce({
        ...standardCart,
        status: "expired",
      });

      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      await expect(
        service.create({
          tenantSlug: "burger-joint",
          cartId: "cart-1",
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Comensal Expirado" },
          },
        }),
      ).rejects.toThrow(CashOrderCartUnavailableError);
    });

    it("throws OrderConflictError when cart has zero item lines", async () => {
      mockCartFind.mockResolvedValueOnce({
        ...standardCart,
        lines: [],
      });

      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      await expect(
        service.create({
          tenantSlug: "burger-joint",
          cartId: "cart-1",
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Comensal Vacio" },
          },
        }),
      ).rejects.toThrow(OrderConflictError);
    });

    it("dynamically recalculates secondsRemaining on replayed idempotency claims", async () => {
      mockIdempotencyClaim.mockResolvedValueOnce({
        replayed: true,
        recordId: "idemp-rec-1",
        body: {
          orderId: "ord-1",
          purchaseNumber: "1084",
          pickupPin: "7428",
          total: "3500.00",
          paymentStatus: "pending",
          expiresAt: new Date(fixedNow.getTime() + 1800 * 1000).toISOString(),
          secondsRemaining: 3600,
        },
      });

      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue(standardPublicTenant),
      } as unknown as PublicTenantService;

      const service = new CreateCashOrderService(mockPublicTenants, () => fixedNow);
      const res = await service.create({
        tenantSlug: "burger-joint",
        cartId: "cart-1",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        body: {
          customer: { name: "Comensal Repetido" },
        },
      });

      expect(res.secondsRemaining).toBe(1800);
    });
  });

  describe("HTTP Endpoint POST /api/v1/storefronts/:tenantSlug/carts/:cartId/cash-orders", () => {
    it("returns HTTP 201 Created with valid payload and correlation header", async () => {
      vi.spyOn(PublicTenantService.prototype, "resolve").mockResolvedValue(standardPublicTenant);

      const request = new Request(
        "https://komanda.app/api/v1/storefronts/burger-joint/carts/cart-1/cash-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          },
          body: JSON.stringify({
            customer: { name: "Juan Pérez" },
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
        }),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("X-Correlation-Id")).toBeDefined();

      const body = (await response.json()) as CreateCashOrderResponse;
      expect(body.orderId).toBe("ord-00000000-0000-4000-8000-000000000001");
      expect(body.purchaseNumber).toBe("1084");
      expect(body.pickupPin).toBe("7428");
      expect(body.total).toBe("3500.00");
      expect(body.paymentStatus).toBe("pending");
      expect(body.secondsRemaining).toBeGreaterThan(0);
    });

    it("returns HTTP 422 IDEMPOTENCY_KEY_REQUIRED when header is absent", async () => {
      const request = new Request(
        "https://komanda.app/api/v1/storefronts/burger-joint/carts/cart-1/cash-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer: { name: "Juan Pérez" },
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
        }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("returns HTTP 422 VALIDATION_FAILED when customer name is empty", async () => {
      vi.spyOn(PublicTenantService.prototype, "resolve").mockResolvedValue(standardPublicTenant);

      const request = new Request(
        "https://komanda.app/api/v1/storefronts/burger-joint/carts/cart-1/cash-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          },
          body: JSON.stringify({
            customer: { name: "    " },
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
        }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("returns HTTP 422 ORDERING_NOT_SUPPORTED when preset is express_retail", async () => {
      vi.spyOn(PublicTenantService.prototype, "resolve").mockResolvedValue({
        ...standardPublicTenant,
        preset: "express_retail",
      });

      const request = new Request(
        "https://komanda.app/api/v1/storefronts/burger-joint/carts/cart-1/cash-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          },
          body: JSON.stringify({
            customer: { name: "Cliente Express" },
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
        }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("ORDERING_NOT_SUPPORTED");
    });

    it("returns HTTP 422 BUSINESS_CLOSED when business is closed", async () => {
      vi.spyOn(PublicTenantService.prototype, "resolve").mockResolvedValue(standardPublicTenant);
      mockLimit.mockResolvedValueOnce([{ salesEnabled: false }]);

      const request = new Request(
        "https://komanda.app/api/v1/storefronts/burger-joint/carts/cart-1/cash-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          },
          body: JSON.stringify({
            customer: { name: "Cliente Noche" },
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
        }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("BUSINESS_CLOSED");
    });

    it("returns HTTP 409 ORDER_CONFLICT on cartVersion conflict", async () => {
      vi.spyOn(PublicTenantService.prototype, "resolve").mockResolvedValue(standardPublicTenant);
      mockCartFind.mockResolvedValueOnce({
        ...standardCart,
        version: 1,
      });

      const request = new Request(
        "https://komanda.app/api/v1/storefronts/burger-joint/carts/cart-1/cash-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          },
          body: JSON.stringify({
            customer: { name: "Cliente Desactualizado" },
            cartVersion: 5,
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
        }),
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe("ORDER_CONFLICT");
    });

    it("returns HTTP 409 ORDER_CONFLICT when cart was already converted", async () => {
      vi.spyOn(PublicTenantService.prototype, "resolve").mockResolvedValue(standardPublicTenant);
      mockCartFind.mockResolvedValueOnce({
        ...standardCart,
        status: "converted",
      });

      const request = new Request(
        "https://komanda.app/api/v1/storefronts/burger-joint/carts/cart-1/cash-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          },
          body: JSON.stringify({
            customer: { name: "Cliente Duplicado" },
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "burger-joint",
          cartId: standardCart.id,
        }),
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe("ORDER_CONFLICT");
    });

    it("returns HTTP 404 non-disclosing not found when cart does not exist", async () => {
      vi.spyOn(PublicTenantService.prototype, "resolve").mockResolvedValue(standardPublicTenant);
      mockCartFind.mockResolvedValueOnce(null);

      const request = new Request(
        "https://komanda.app/api/v1/storefronts/burger-joint/carts/cart-inexistente/cash-orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          },
          body: JSON.stringify({
            customer: { name: "Cliente Perdido" },
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "burger-joint",
          cartId: "cart-inexistente",
        }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe("RESOURCE_NOT_FOUND");
    });
  });
});
