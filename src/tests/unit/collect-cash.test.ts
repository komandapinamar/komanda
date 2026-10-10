import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

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
const mockFindById = vi.fn();
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: vi.fn().mockImplementation(function () {
    return {
      findById: mockFindById,
      appendTransitionEvent: mockAppendTransitionEvent,
    };
  }),
}));

const mockEnqueueOrderTicketInTransaction = vi.fn();
vi.mock("@/features/printing/application/print-job.service", () => ({
  PrintJobService: vi.fn().mockImplementation(function () {
    return {
      enqueueOrderTicketInTransaction: mockEnqueueOrderTicketInTransaction,
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
  collectCashSchema,
  type CollectCashResponse,
} from "@/features/orders/domain/collect-cash.schemas";
import {
  CollectCashService,
  ForbiddenRoleError,
} from "@/features/orders/application/collect-cash.service";
import {
  InvalidPickupPinError,
  NoOpenCashShiftError,
  OrderConflictError,
  OrderNotFoundError,
} from "@/features/orders/application/order-errors";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { POST } from "@/app/api/v1/tenants/[tenantId]/orders/[orderId]/collect-cash/route";
import * as tenantAuthority from "@/features/identity/web/tenant-authority";
import { createVerifiedTenantContext, type TenantContext } from "@/lib/tenant-context/types";

describe("Story 2.3: Endpoint Transaccional de Cobro en Mostrador (collect-cash)", () => {
  const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
  const locationId = "2c5fb634-425c-4a7e-830e-1392d2e3d0af";
  const orderId = "62d47dd7-d84d-4313-87f1-d0e72dfafafe";
  const shiftId = "3c5fb634-425c-4a7e-830e-1392d2e3d0b1";
  const fixedNow = new Date("2026-10-05T15:30:00.000Z");

  const operatorContext: TenantContext = createVerifiedTenantContext({
    tenantId,
    locationId,
    correlationId: "corr-collect-cash-test",
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
    paymentStatus: "pending",
    tender: "cash",
    customerSnapshot: { name: "Carlos Perez" },
    notes: null,
    subtotal: "12500.00",
    discountTotal: "0.00",
    total: "12500.00",
    currency: "ARS",
    pickupPin: "5821",
    version: 1,
    createdAt: new Date("2026-10-05T15:00:00.000Z"),
    updatedAt: new Date("2026-10-05T15:00:00.000Z"),
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
  describe("Domain & Schema: collectCashSchema", () => {
    it("valida payload exitoso con authMethod: 'pickup_pin' y authCode string de 4 dígitos", () => {
      const parsed = collectCashSchema.safeParse({
        authMethod: "pickup_pin",
        authCode: "5821",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.authMethod).toBe("pickup_pin");
        expect(parsed.data.authCode).toBe("5821");
      }
    });

    it("coerciona authCode numérico a string", () => {
      const parsed = collectCashSchema.safeParse({
        authMethod: "pickup_pin",
        authCode: 5821,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.authCode).toBe("5821");
      }
    });

    it("rechaza authMethod: 'pickup_pin' sin authCode", () => {
      const parsed = collectCashSchema.safeParse({
        authMethod: "pickup_pin",
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.path).toContain("authCode");
      }
    });

    it("rechaza authMethod: 'pickup_pin' con authCode cadena vacía", () => {
      const parsed = collectCashSchema.safeParse({
        authMethod: "pickup_pin",
        authCode: "",
      });
      expect(parsed.success).toBe(false);
    });

    it("valida payload exitoso con authMethod: 'account_auth' sin authCode", () => {
      const parsed = collectCashSchema.safeParse({
        authMethod: "account_auth",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.authMethod).toBe("account_auth");
        expect(parsed.data.authCode).toBeUndefined();
      }
    });

    it("rechaza authMethod desconocido", () => {
      const parsed = collectCashSchema.safeParse({
        authMethod: "fingerprint",
      });
      expect(parsed.success).toBe(false);
    });

    it("rechaza campos extras no permitidos por strict()", () => {
      const parsed = collectCashSchema.safeParse({
        authMethod: "pickup_pin",
        authCode: "5821",
        unexpectedField: "hack",
      });
      expect(parsed.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Error Definitions and HTTP Problem Details Mapping
  // -------------------------------------------------------------------------
  describe("Error Definitions & HTTP Problem Details Mappings", () => {
    it("NoOpenCashShiftError posee el código NO_OPEN_CASH_SHIFT", () => {
      const err = new NoOpenCashShiftError();
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("NoOpenCashShiftError");
      expect(err.code).toBe("NO_OPEN_CASH_SHIFT");
    });

    it("orderErrorResponse mapea NoOpenCashShiftError a HTTP 422 con código NO_OPEN_CASH_SHIFT", async () => {
      const err = new NoOpenCashShiftError("No existe turno abierto.");
      const res = orderErrorResponse(err, "corr-test-1");

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe("NO_OPEN_CASH_SHIFT");
      expect(body.detail).toBe("No existe turno abierto.");
      expect(body.title).toBe("No open cash shift");
    });

    it("orderErrorResponse mapea InvalidPickupPinError a HTTP 422 con código INVALID_PICKUP_PIN", async () => {
      const err = new InvalidPickupPinError("PIN incorrecto.");
      const res = orderErrorResponse(err, "corr-test-2");

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe("INVALID_PICKUP_PIN");
      expect(body.detail).toBe("PIN incorrecto.");
    });

    it("orderErrorResponse mapea OrderConflictError a HTTP 409 con código ORDER_CONFLICT", async () => {
      const err = new OrderConflictError("Orden cancelada previamente.");
      const res = orderErrorResponse(err, "corr-test-3");

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ORDER_CONFLICT");
    });

    it("orderErrorResponse mapea ForbiddenRoleError a HTTP 403 con código FORBIDDEN_ROLE", async () => {
      const err = new ForbiddenRoleError("Rol no autorizado.");
      const res = orderErrorResponse(err, "corr-test-4");

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("FORBIDDEN_ROLE");
      expect(body.detail).toBe("Rol no autorizado.");
    });

    it("orderErrorResponse mapea OrderNotFoundError a HTTP 404 no divulgativo", async () => {
      const err = new OrderNotFoundError("Not found");
      const res = orderErrorResponse(err, "corr-test-5");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("RESOURCE_NOT_FOUND");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Application Service: CollectCashService
  // -------------------------------------------------------------------------
  describe("CollectCashService.collect()", () => {
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
                paymentStatus: "paid",
                version: order.version + 1,
                updatedAt: fixedNow,
              },
            ]),
          }),
        }),
      });

      mockTx.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      });

      mockFindById.mockResolvedValue({
        ...order,
        paymentStatus: "paid",
        purchaseNumber: "1084",
        lines: [],
      });
    }

    it("Cobro exitoso con PIN de pedido: transiciona a paid, inserta sale_deposit, encola comanda y outbox", async () => {
      setupSuccessfulDbMocks();
      const service = new CollectCashService(() => fixedNow);

      const result = await service.collect({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        body: {
          authMethod: "pickup_pin",
          authCode: "5821",
        },
      });

      // 1. Respuesta exitosa esperada
      expect(result).toEqual({
        orderId,
        purchaseNumber: "1084",
        paymentStatus: "paid",
        paidAt: fixedNow.toISOString(),
        version: 2,
      });

      // 2. Verificación de actualización a paid con concurrencia optimista
      expect(mockTx.update).toHaveBeenCalled();

      // 3. Verificación de movimiento de caja sale_deposit en cashRegisterMovements (AD-4)
      expect(mockTx.insert).toHaveBeenCalledWith(cashRegisterMovements);
      expect(mockTx.insert.mock.results[0]?.value?.values).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, locationId, orderId, type: "sale_deposit", shiftId }),
      );
      expect(mockAppendTransitionEvent).toHaveBeenCalledWith({
        orderId,
        fromStatus: sampleOrderRow.fulfillmentStatus,
        toStatus: sampleOrderRow.fulfillmentStatus,
      });

      // 4. Verificación de comanda de cocina encolada en PrintJobService
      expect(mockEnqueueOrderTicketInTransaction).toHaveBeenCalledWith(
        mockTx,
        operatorContext,
        expect.objectContaining({
          id: orderId,
          paymentStatus: "paid",
        }),
      );

      // 5. Verificación de eventos outbox
      expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        operatorContext,
        expect.objectContaining({
          eventType: "order.paid",
          payload: expect.objectContaining({
            orderId,
            paymentStatus: "paid",
          }),
        }),
      );
      expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        operatorContext,
        expect.objectContaining({
          eventType: "print.intent.created",
          payload: expect.objectContaining({
            orderId,
            paymentStatus: "paid",
          }),
        }),
      );

      // 6. Verificación de auditoría
      expect(mockAppendAuditEvent).toHaveBeenCalledWith(
        mockTx,
        operatorContext,
        expect.objectContaining({
          action: "order.collect_cash",
          resourceId: orderId,
          outcome: "allowed",
        }),
      );

      // 7. Idempotency completado
      expect(mockIdempotencyComplete).toHaveBeenCalledWith(
        "idemp-claim-1",
        200,
        result,
      );
    });

    it("Cobro exitoso con autenticación de cuenta de usuario (account_auth)", async () => {
      setupSuccessfulDbMocks();
      const service = new CollectCashService(() => fixedNow);

      const result = await service.collect({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
        body: {
          authMethod: "account_auth",
        },
      });

      expect(result.paymentStatus).toBe("paid");
      expect(result.orderId).toBe(orderId);
      expect(mockEnqueueOrderTicketInTransaction).toHaveBeenCalled();
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it("Sin turno abierto en la sucursal: cobra, asienta el ingreso sin turno y despacha cocina", async () => {
      setupSuccessfulDbMocks({}, null);
      const service = new CollectCashService(() => fixedNow);
      const result = await service.collect({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000003",
        body: { authMethod: "pickup_pin", authCode: "5821" },
      });

      expect(result.paymentStatus).toBe("paid");
      expect(mockTx.insert).toHaveBeenCalledTimes(1);
      expect(mockTx.insert.mock.results[0]?.value?.values).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, locationId, orderId, type: "sale_deposit", shiftId: null }),
      );
      expect(mockEnqueueOrderTicketInTransaction).toHaveBeenCalledTimes(1);
      expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
        mockTx,
        operatorContext,
        expect.objectContaining({ eventType: "order.paid" }),
      );
    });

    it("Un turno abierto en otra sucursal no se vincula al cobro", async () => {
      // The location-filtered shift lookup returns no matching row.
      setupSuccessfulDbMocks({}, null);
      await new CollectCashService(() => fixedNow).collect({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000016",
        body: { authMethod: "account_auth" },
      });
      const shiftSelect = mockTx.select.mock.results[1]?.value;
      const shiftWhere = shiftSelect.from.mock.results[0]?.value.where.mock.calls[0]?.[0];
      const query = new PgDialect().sqlToQuery(shiftWhere);
      expect(query.sql).toContain('"cash_shifts"."location_id"');
      expect(query.params).toContain(locationId);
      expect(mockTx.insert.mock.results[0]?.value?.values).toHaveBeenCalledWith(
        expect.objectContaining({ locationId, shiftId: null }),
      );
    });

    it("PIN de cobro incorrecto: rechaza con InvalidPickupPinError sin alterar la orden", async () => {
      let selectCallCount = 0;
      mockTx.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          selectCallCount++;
          return {
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                if (selectCallCount === 1) {
                  return Promise.resolve([sampleOrderRow]);
                }
                return Promise.resolve([sampleOpenShiftRow]);
              }),
            })),
          };
        }),
      }));

      const service = new CollectCashService(() => fixedNow);

      await expect(
        service.collect({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000004",
          body: {
            authMethod: "pickup_pin",
            authCode: "9999", // PIN incorrecto (el correcto es 5821)
          },
        }),
      ).rejects.toThrow(InvalidPickupPinError);

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
      expect(mockEnqueueOrderTicketInTransaction).not.toHaveBeenCalled();
    });

    it("Orden ya cobrada (idempotencia en capa de negocio): responde HTTP 200 sin duplicar movimiento ni comanda", async () => {
      const alreadyPaidOrder = {
        ...sampleOrderRow,
        paymentStatus: "paid",
        updatedAt: new Date("2026-10-05T15:10:00.000Z"),
      };

      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([alreadyPaidOrder]),
          }),
        }),
      });

      const service = new CollectCashService(() => fixedNow);

      const result = await service.collect({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000005",
        body: {
          authMethod: "account_auth",
        },
      });

      expect(result).toEqual({
        orderId,
        purchaseNumber: "1084",
        paymentStatus: "paid",
        paidAt: "2026-10-05T15:10:00.000Z",
        version: 1,
      });

      // Regla NEVER: No debe duplicar sale_deposit ni comanda
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
      expect(mockEnqueueOrderTicketInTransaction).not.toHaveBeenCalled();
    });

    it("Orden cancelada previamente: rechaza con OrderConflictError (409)", async () => {
      const cancelledOrder = {
        ...sampleOrderRow,
        fulfillmentStatus: "cancelled",
      };

      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([cancelledOrder]),
          }),
        }),
      });

      const service = new CollectCashService(() => fixedNow);

      await expect(
        service.collect({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000006",
          body: {
            authMethod: "account_auth",
          },
        }),
      ).rejects.toThrow(OrderConflictError);

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it("Orden reembolsada previamente: rechaza con OrderConflictError (409)", async () => {
      const refundedOrder = {
        ...sampleOrderRow,
        paymentStatus: "refunded",
      };

      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([refundedOrder]),
          }),
        }),
      });

      const service = new CollectCashService(() => fixedNow);

      await expect(
        service.collect({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000007",
          body: {
            authMethod: "account_auth",
          },
        }),
      ).rejects.toThrow(OrderConflictError);
    });

    it("Orden con medio de pago no efectivo (tender != 'cash'): rechaza con OrderConflictError (409)", async () => {
      const posnetOrder = {
        ...sampleOrderRow,
        tender: "posnet",
      };

      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([posnetOrder]),
          }),
        }),
      });

      const service = new CollectCashService(() => fixedNow);

      await expect(
        service.collect({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000008",
          body: {
            authMethod: "account_auth",
          },
        }),
      ).rejects.toThrow(OrderConflictError);
    });

    it("Orden inexistente: rechaza con OrderNotFoundError (404 no divulgativo)", async () => {
      mockTx.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const service = new CollectCashService(() => fixedNow);

      await expect(
        service.collect({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000009",
          body: {
            authMethod: "account_auth",
          },
        }),
      ).rejects.toThrow(OrderNotFoundError);
    });

    it("Reintento con Idempotency-Key repetida: retorna el resultado anterior sin ejecutar mutaciones", async () => {
      const cachedResponse: CollectCashResponse = {
        orderId,
        purchaseNumber: "1084",
        paymentStatus: "paid",
        paidAt: "2026-10-05T15:30:00.000Z",
        version: 1,
      };

      mockIdempotencyClaim.mockResolvedValue({
        replayed: true,
        status: 200,
        body: cachedResponse,
      });

      const service = new CollectCashService(() => fixedNow);

      const result = await service.collect({
        context: operatorContext,
        orderId,
        idempotencyKey: "00000000-0000-4000-8000-000000000010",
        body: {
          authMethod: "pickup_pin",
          authCode: "5821",
        },
      });

      expect(result).toEqual(cachedResponse);
      expect(mockTx.select).not.toHaveBeenCalled();
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
      expect(mockEnqueueOrderTicketInTransaction).not.toHaveBeenCalled();
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

      const service = new CollectCashService(() => fixedNow);

      await expect(
        service.collect({
          context: unauthorizedContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000011",
          body: {
            authMethod: "account_auth",
          },
        }),
      ).rejects.toThrow(ForbiddenRoleError);
    });

    it("Conflicto de concurrencia optimista (version stale en update): rechaza con OrderConflictError", async () => {
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

      // Update returns empty (stale version)
      mockTx.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const service = new CollectCashService(() => fixedNow);

      await expect(
        service.collect({
          context: operatorContext,
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000012",
          body: {
            authMethod: "pickup_pin",
            authCode: "5821",
          },
        }),
      ).rejects.toThrow(OrderConflictError);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Route Handler: POST /api/v1/tenants/:tenantId/orders/:orderId/collect-cash
  // -------------------------------------------------------------------------
  describe("POST /api/v1/tenants/:tenantId/orders/:orderId/collect-cash Route Adapter", () => {
    beforeEach(() => {
      vi.spyOn(tenantAuthority, "administrativeTenantContext").mockResolvedValue(operatorContext);
    });

    it("Rechaza petición sin cabecera Idempotency-Key con HTTP 422 IDEMPOTENCY_KEY_REQUIRED", async () => {
      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders/${orderId}/collect-cash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            authMethod: "pickup_pin",
            authCode: "5821",
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ tenantId, orderId }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("Rechaza tenantId u orderId con formato no UUID con HTTP 404 no divulgativo", async () => {
      const request = new Request(
        `http://localhost/api/v1/tenants/invalid-uuid/orders/${orderId}/collect-cash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "00000000-0000-4000-8000-000000000013",
          },
          body: JSON.stringify({
            authMethod: "account_auth",
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ tenantId: "invalid-uuid", orderId }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe("RESOURCE_NOT_FOUND");
    });

    it("Ejecución exitosa completa vía POST retorna HTTP 200 con { orderId, purchaseNumber, paymentStatus, paidAt }", async () => {
      const expectedResponse: CollectCashResponse = {
        orderId,
        purchaseNumber: "1084",
        paymentStatus: "paid",
        paidAt: fixedNow.toISOString(),
        version: 1,
      };

      const collectSpy = vi.spyOn(CollectCashService.prototype, "collect").mockResolvedValue(expectedResponse);

      const correlationId = "e0000000-0000-4000-8000-000000000001";
      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders/${orderId}/collect-cash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "00000000-0000-4000-8000-000000000014",
            "X-Correlation-Id": correlationId,
          },
          body: JSON.stringify({
            authMethod: "pickup_pin",
            authCode: "5821",
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({ tenantId, orderId }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Correlation-Id")).toBe(correlationId);
      const body = await response.json();
      expect(body).toEqual(expectedResponse);
      expect(collectSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          idempotencyKey: "00000000-0000-4000-8000-000000000014",
        }),
      );
    });

    it("Propaga error de esquema Zod a HTTP 422 VALIDATION_FAILED", async () => {
      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders/${orderId}/collect-cash`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "00000000-0000-4000-8000-000000000015",
          },
          body: JSON.stringify({
            authMethod: "pickup_pin",
            // falta authCode requerido para pickup_pin
          }),
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
