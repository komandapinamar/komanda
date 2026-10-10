import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock transaction
const mockTx = {
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_context, callback) => callback(mockTx)),
}));

// Mock repositories and services
const mockAppendTransitionEvent = vi.fn();
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: vi.fn().mockImplementation(function () {
    return {
      appendTransitionEvent: mockAppendTransitionEvent,
    };
  }),
}));

const mockMarkRedemptionCancelled = vi.fn();
vi.mock("@/features/discounts/infrastructure/discount.repository", () => ({
  DiscountRepository: vi.fn().mockImplementation(function () {
    return {
      markRedemptionCancelled: mockMarkRedemptionCancelled,
    };
  }),
}));

const mockAppendAuditEvent = vi.fn();
vi.mock("@/lib/audit/audit.service", () => ({
  appendAuditEvent: (...args: unknown[]) => mockAppendAuditEvent(...args),
}));

const mockAppendOutboxEvent = vi.fn();
vi.mock("@/lib/outbox/outbox.service", () => ({
  appendOutboxEvent: (...args: unknown[]) => mockAppendOutboxEvent(...args),
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

import { cashRegisterMovements } from "@/db/schema";
import {
  refundCashSchema,
  type RefundCashResponse,
} from "@/features/orders/domain/refund-cash.schemas";
import {
  ForbiddenRoleError,
  RefundCashService,
} from "@/features/orders/application/refund-cash.service";
import {
  NoOpenCashShiftError,
  OrderConflictError,
  OrderNotFoundError,
} from "@/features/orders/application/order-errors";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { POST } from "@/app/api/v1/tenants/[tenantId]/orders/[orderId]/refund-cash/route";
import * as tenantAuthority from "@/features/identity/web/tenant-authority";
import { createVerifiedTenantContext, type TenantContext } from "@/lib/tenant-context/types";

describe("Story 3.1: Endpoint Transaccional de Devolución de Efectivo (refund-cash)", () => {
  const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
  const locationId = "2c5fb634-425c-4a7e-830e-1392d2e3d0af";
  const orderId = "62d47dd7-d84d-4313-87f1-d0e72dfafafe";
  const shiftId = "3c5fb634-425c-4a7e-830e-1392d2e3d0b1";
  const cashMovementId = "8c5fb634-425c-4a7e-830e-1392d2e3d0b2";
  const fixedNow = new Date("2026-10-05T15:30:00.000Z");

  const operatorContext: TenantContext = createVerifiedTenantContext({
    tenantId,
    locationId,
    correlationId: "corr-refund-cash-test",
    source: "administrative",
    actor: {
      kind: "user",
      userId: "user-operator-1",
      membershipId: "member-1",
      role: "employee",
    },
  });

  const sampleOrderRow = {
    id: orderId,
    tenantId,
    locationId,
    cartId: "00000000-0000-4000-8000-000000000001",
    purchaseNumber: BigInt(1084),
    source: "storefront_cash",
    fulfillmentStatus: "approved",
    paymentStatus: "paid",
    tender: "cash",
    customerSnapshot: { name: "Carlos Perez" },
    notes: null,
    subtotal: "12500.00",
    discountTotal: "0.00",
    total: "12500.00",
    currency: "ARS",
    pickupPin: "5821",
    version: 1,
    discountSnapshot: null,
    createdAt: new Date("2026-10-05T15:00:00.000Z"),
    updatedAt: new Date("2026-10-05T15:10:00.000Z"),
  };

  const sampleOpenShiftRow = {
    id: shiftId,
    tenantId,
    locationId,
    status: "open",
    openedByUserId: "user-operator-1",
    openingBalance: "50000.00",
    openedAt: new Date("2026-10-05T08:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockIdempotencyClaim.mockResolvedValue({
      replayed: false,
      recordId: "idemp-claim-1",
      requestHash: "hash-1",
    });
    mockIdempotencyComplete.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // 1. Domain & Zod Schema Validation
  // -------------------------------------------------------------------------
  describe("Domain & Schema: refundCashSchema", () => {
    it("valida payload exitoso con reason y operatorNote", () => {
      const parsed = refundCashSchema.safeParse({
        reason: "Falta de stock en depósito.",
        operatorNote: "Cliente avisado por teléfono.",
      });
      expect(parsed.success).toBe(true);
    });

    it("valida payload sin operatorNote (opcional)", () => {
      const parsed = refundCashSchema.safeParse({ reason: "Error operativo." });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.operatorNote).toBeUndefined();
      }
    });

    it("rechaza reason ausente", () => {
      const parsed = refundCashSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it("rechaza reason vacío o solo espacios", () => {
      expect(refundCashSchema.safeParse({ reason: "" }).success).toBe(false);
      expect(refundCashSchema.safeParse({ reason: "   " }).success).toBe(false);
    });

    it("rechaza operatorNote mayor a 1000 caracteres", () => {
      const parsed = refundCashSchema.safeParse({
        reason: "Motivo",
        operatorNote: "x".repeat(1001),
      });
      expect(parsed.success).toBe(false);
    });

    it("rechaza campos extras por strict()", () => {
      const parsed = refundCashSchema.safeParse({
        reason: "Motivo",
        unexpected: "campo",
      });
      expect(parsed.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Error Definitions and HTTP Problem Details Mapping
  // -------------------------------------------------------------------------
  describe("Error Definitions & HTTP Problem Details Mappings", () => {
    it("orderErrorResponse mapea NoOpenCashShiftError a HTTP 422", async () => {
      const res = orderErrorResponse(
        new NoOpenCashShiftError("No existe turno abierto."),
        "corr-test-1",
      );
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe("NO_OPEN_CASH_SHIFT");
    });

    it("orderErrorResponse mapea OrderConflictError a HTTP 409 ORDER_CONFLICT", async () => {
      const res = orderErrorResponse(
        new OrderConflictError("Orden impaga."),
        "corr-test-2",
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ORDER_CONFLICT");
    });

    it("orderErrorResponse mapea ForbiddenRoleError a HTTP 403", async () => {
      const res = orderErrorResponse(
        new ForbiddenRoleError("Rol no autorizado."),
        "corr-test-3",
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("FORBIDDEN_ROLE");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Application Service: RefundCashService
  // -------------------------------------------------------------------------
  describe("RefundCashService.refund()", () => {
    function setupSuccessfulDbMocks(orderOverrides = {}, openShift: typeof sampleOpenShiftRow | null = sampleOpenShiftRow) {
      const order = { ...sampleOrderRow, ...orderOverrides };

      let selectCallCount = 0;
      mockTx.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                // First select is tenantOrders
                if (selectCallCount === 1) {
                  return Promise.resolve([order]);
                }
                // Second select is cashShifts
                return Promise.resolve(openShift ? [openShift] : []);
              }),
            })),
          };
        }),
      }));

      mockTx.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                ...order,
                paymentStatus: "refunded",
                fulfillmentStatus: "cancelled",
                version: order.version + 1,
                updatedAt: fixedNow,
              },
            ]),
          }),
        }),
      });

      mockTx.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: cashMovementId }]),
        }),
      });

      mockMarkRedemptionCancelled.mockResolvedValue(true);
    }

    it("Devolución exitosa: transiciona a refunded/cancelled, inserta cancellation_withdrawal vinculado al turno, audita y emite outbox", async () => {
      setupSuccessfulDbMocks();
      const service = new RefundCashService(() => fixedNow);

      const result = await service.refund({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        body: { reason: "Cliente desiste del pedido.", operatorNote: "Atención caja 2" },
      });

      expect(result).toEqual({
        orderId,
        paymentStatus: "refunded",
        fulfillmentStatus: "cancelled",
        refundedAt: fixedNow.toISOString(),
        cashMovementId,
        version: 2,
      });

      expect(mockTx.update).toHaveBeenCalledWith(expect.anything());
      expect(mockTx.insert).toHaveBeenCalledWith(cashRegisterMovements);
      expect(mockAppendTransitionEvent).toHaveBeenCalledWith({
        orderId,
        fromStatus: sampleOrderRow.fulfillmentStatus,
        toStatus: "cancelled",
      });
      expect(mockAppendAuditEvent).toHaveBeenCalledWith(
        mockTx,
        operatorContext,
        expect.objectContaining({
          action: "order.refund_cash",
          resourceId: orderId,
          outcome: "allowed",
          metadata: expect.objectContaining({ reason: "Cliente desiste del pedido." }),
        }),
      );
      expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        operatorContext,
        expect.objectContaining({
          eventType: "order.refunded",
          payload: expect.objectContaining({
            orderId,
            paymentStatus: "refunded",
            fulfillmentStatus: "cancelled",
          }),
        }),
      );
      expect(mockIdempotencyComplete).toHaveBeenCalledWith("idemp-claim-1", 200, result);
    });

    it("Egreso asienta amount = order.total, type cancellation_withdrawal y shiftId del turno abierto", async () => {
      setupSuccessfulDbMocks();
      const service = new RefundCashService(() => fixedNow);

      await service.refund({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
        body: { reason: "Error de cobro" },
      });

      const valuesMock = mockTx.insert.mock.results[0]?.value?.values;
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "cancellation_withdrawal",
          amount: "12500.00",
          shiftId,
          orderId,
          tenantId,
        }),
      );
    });

    it("Orden con cupón: marca la redención como cancelled sin alterar redemptions_count", async () => {
      setupSuccessfulDbMocks({
        discountSnapshot: { code: "PROMO10", discountTotal: "1800.00" },
      });
      const service = new RefundCashService(() => fixedNow);

      await service.refund({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000003",
        body: { reason: "Reclamo del cliente" },
      });

      expect(mockMarkRedemptionCancelled).toHaveBeenCalledWith(orderId);
    });

    it("Sin turno abierto: reembolsa y registra egreso sin turno", async () => {
      setupSuccessfulDbMocks({}, null);
      const service = new RefundCashService(() => fixedNow);
      const result = await service.refund({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000004",
        body: { reason: "Motivo" },
      });

      expect(result.paymentStatus).toBe("refunded");
      expect(result.cashMovementId).toBe(cashMovementId);
      expect(mockTx.insert).toHaveBeenCalledTimes(1);
      expect(mockTx.insert.mock.results[0]?.value?.values).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, locationId, orderId, type: "cancellation_withdrawal", shiftId: null }),
      );
      expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        operatorContext,
        expect.objectContaining({ eventType: "order.refunded" }),
      );
    });

    it("Orden impaga (payment_status pending): rechaza con OrderConflictError", async () => {
      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ...sampleOrderRow, paymentStatus: "pending" }]),
          }),
        }),
      });

      const service = new RefundCashService(() => fixedNow);

      await expect(
        service.refund({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000005",
          body: { reason: "Motivo" },
        }),
      ).rejects.toThrow(OrderConflictError);

      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it("Orden ya reembolsada (distinta Idempotency-Key): responde 200 idempotente sin duplicar egreso", async () => {
      const refundedOrder = {
        ...sampleOrderRow,
        paymentStatus: "refunded",
        fulfillmentStatus: "cancelled",
        updatedAt: new Date("2026-10-05T15:20:00.000Z"),
      };

      let selectCallCount = 0;
      mockTx.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                if (selectCallCount === 1) return Promise.resolve([refundedOrder]);
                return Promise.resolve([{ id: cashMovementId }]);
              }),
            }),
          };
        }),
      }));

      const service = new RefundCashService(() => fixedNow);

      const result = await service.refund({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000006",
        body: { reason: "Motivo" },
      });

      expect(result).toEqual({
        orderId,
        paymentStatus: "refunded",
        fulfillmentStatus: "cancelled",
        refundedAt: "2026-10-05T15:20:00.000Z",
        cashMovementId: "8c5fb634-425c-4a7e-830e-1392d2e3d0b2",
        version: 1,
      });
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it("Orden con tender no efectivo: rechaza con OrderConflictError", async () => {
      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ...sampleOrderRow, tender: "posnet" }]),
          }),
        }),
      });

      const service = new RefundCashService(() => fixedNow);

      await expect(
        service.refund({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000007",
          body: { reason: "Motivo" },
        }),
      ).rejects.toThrow(OrderConflictError);
    });

    it("Orden entregada (delivered): rechaza con OrderConflictError sin mutaciones", async () => {
      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([
                { ...sampleOrderRow, fulfillmentStatus: "delivered" },
              ]),
          }),
        }),
      });

      const service = new RefundCashService(() => fixedNow);

      await expect(
        service.refund({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000009",
          body: { reason: "Motivo" },
        }),
      ).rejects.toThrow(OrderConflictError);

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it("Orden inexistente: rechaza con OrderNotFoundError", async () => {
      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const service = new RefundCashService(() => fixedNow);

      await expect(
        service.refund({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000008",
          body: { reason: "Motivo" },
        }),
      ).rejects.toThrow(OrderNotFoundError);
    });

    it("reason vacío: rechaza con ZodError (VALIDATION_FAILED)", async () => {
      const service = new RefundCashService(() => fixedNow);

      await expect(
        service.refund({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000009",
          body: { reason: "   " },
        }),
      ).rejects.toThrow();

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it("Replay con Idempotency-Key repetida: retorna resultado cacheado sin mutaciones", async () => {
      const cachedResponse: RefundCashResponse = {
        orderId,
        paymentStatus: "refunded",
        fulfillmentStatus: "cancelled",
        refundedAt: fixedNow.toISOString(),
        cashMovementId,
        version: 1,
      };

      mockIdempotencyClaim.mockResolvedValue({
        replayed: true,
        status: 200,
        body: cachedResponse,
      });

      const service = new RefundCashService(() => fixedNow);

      const result = await service.refund({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000010",
        body: { reason: "Motivo" },
      });

      expect(result).toEqual(cachedResponse);
      expect(mockTx.select).not.toHaveBeenCalled();
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it("Operador sin rol autorizado: rechaza con ForbiddenRoleError", async () => {
      const unauthorizedContext: TenantContext = createVerifiedTenantContext({
        tenantId,
        locationId,
        correlationId: "corr-unauth",
        source: "administrative",
        actor: {
          kind: "user",
          userId: "user-stranger",
          membershipId: "mem-x",
          role: "customer" as never,
        },
      });

      const service = new RefundCashService(() => fixedNow);

      await expect(
        service.refund({
          context: unauthorizedContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000011",
          body: { reason: "Motivo" },
        }),
      ).rejects.toThrow(ForbiddenRoleError);
    });

    it("Conflicto de versión optimista: rechaza con OrderConflictError", async () => {
      let selectCallCount = 0;
      mockTx.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                if (selectCallCount === 1) return Promise.resolve([sampleOrderRow]);
                return Promise.resolve([sampleOpenShiftRow]);
              }),
            })),
          };
        }),
      }));

      mockTx.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const service = new RefundCashService(() => fixedNow);

      await expect(
        service.refund({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000012",
          body: { reason: "Motivo" },
        }),
      ).rejects.toThrow(OrderConflictError);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Route Handler
  // -------------------------------------------------------------------------
  describe("POST /api/v1/tenants/:tenantId/orders/:orderId/refund-cash Route Adapter", () => {
    beforeEach(() => {
      vi.spyOn(tenantAuthority, "administrativeTenantContext").mockResolvedValue(operatorContext);
    });

    it("Rechaza petición sin cabecera Idempotency-Key con HTTP 422 IDEMPOTENCY_KEY_REQUIRED", async () => {
      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders/${orderId}/refund-cash`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Motivo" }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ tenantId, orderId }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("Rechaza UUID inválido con HTTP 404 no divulgativo", async () => {
      const request = new Request(
        `http://localhost/api/v1/tenants/invalid-uuid/orders/${orderId}/refund-cash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "00000000-0000-4000-8000-000000000013",
          },
          body: JSON.stringify({ reason: "Motivo" }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ tenantId: "invalid-uuid", orderId }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe("RESOURCE_NOT_FOUND");
    });

    it("Ejecución exitosa vía POST retorna HTTP 200 con la respuesta esperada", async () => {
      const expectedResponse: RefundCashResponse = {
        orderId,
        paymentStatus: "refunded",
        fulfillmentStatus: "cancelled",
        refundedAt: fixedNow.toISOString(),
        cashMovementId,
        version: 1,
      };

      const refundSpy = vi
        .spyOn(RefundCashService.prototype, "refund")
        .mockResolvedValue(expectedResponse);

      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders/${orderId}/refund-cash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "00000000-0000-4000-8000-000000000014",
          },
          body: JSON.stringify({ reason: "Motivo" }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ tenantId, orderId }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedResponse);
      expect(refundSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000014",
        }),
      );
    });

    it("Propaga error de esquema Zod a HTTP 422 VALIDATION_FAILED", async () => {
      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders/${orderId}/refund-cash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "00000000-0000-4000-8000-000000000015",
          },
          body: JSON.stringify({}),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ tenantId, orderId }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_FAILED");
    });
  });
});
