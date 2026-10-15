import { beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { tenantOrders } from "@/db/schema";

const { mockTx } = vi.hoisted(() => ({
  mockTx: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_context, callback) => callback(mockTx)),
}));

import { OrderRepository, type OrderView } from "@/features/orders/infrastructure/order.repository";
import { OrderQueryService } from "@/features/orders/application/order-query.service";
import { OrderValidationError } from "@/features/orders/application/order-errors";
import { PrintJobService } from "@/features/printing/application/print-job.service";
import { PrintJobRepository } from "@/features/printing/infrastructure/print-job.repository";
import { createVerifiedTenantContext, type TenantContext } from "@/lib/tenant-context/types";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { GET } from "@/app/api/v1/tenants/[tenantId]/orders/route";
import * as tenantAuthority from "@/features/identity/web/tenant-authority";

describe("Story 2.1: Gating Estricto de Cocina en Capa de Repositorio y KDS", () => {
  const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
  const locationId = "2c5fb634-425c-4a7e-830e-1392d2e3d0af";

  const context: TenantContext = createVerifiedTenantContext({
    tenantId,
    locationId,
    correlationId: "corr-kitchen-gating-test",
    source: "administrative",
    actor: {
      kind: "user",
      userId: "user-test-1",
      membershipId: "member-test-1",
      role: "owner",
    },
  });

  const pool = new Pool();
  const db = drizzle(pool);

  describe("OrderRepository.list() - Cláusula WHERE y Gating SQL", () => {
    it("con scope='kitchen' filtra estrictamente payment_status = 'paid' y fulfillment_status in ('approved', 'preparing')", async () => {
      let capturedWhere: unknown = null;

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation((condition) => {
              capturedWhere = condition;
              return {
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              };
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new OrderRepository(mockTx, context);
      await repo.list({ scope: "kitchen" });

      expect(capturedWhere).toBeDefined();

      const query = db.select().from(tenantOrders).where(capturedWhere as never);
      const { sql, params } = query.toSQL();

      // Debe incluir filtro por tenant
      expect(params).toContain(tenantId);
      // Invariante AD-3: payment_status = 'paid'
      expect(sql).toContain('"payment_status" =');
      expect(params).toContain("paid");
      // Debe excluir órdenes impagas (no puede tener 'pending')
      expect(params).not.toContain("pending");
      // Invariante AD-3: fulfillment_status in ('approved', 'preparing')
      expect(sql).toContain('"fulfillment_status" in');
      expect(params).toContain("approved");
      expect(params).toContain("preparing");
      // No debe incluir 'ready' en el alcance de cocina por defecto
      expect(params).not.toContain("ready");
    });

    it("con scope='kitchen' y status='preparing' filtra payment_status='paid' y fulfillment_status='preparing'", async () => {
      let capturedWhere: unknown = null;

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation((condition) => {
              capturedWhere = condition;
              return {
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              };
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new OrderRepository(mockTx, context);
      await repo.list({ scope: "kitchen", status: "preparing" });

      expect(capturedWhere).toBeDefined();

      const query = db.select().from(tenantOrders).where(capturedWhere as never);
      const { sql, params } = query.toSQL();

      expect(sql).toContain('"payment_status" =');
      expect(params).toContain("paid");
      expect(params).toContain("preparing");
    });

    it("sin scope (consulta general POS) NO filtra payment_status para mostrar pendientes", async () => {
      let capturedWhere: unknown = null;

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation((condition) => {
              capturedWhere = condition;
              return {
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              };
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new OrderRepository(mockTx, context);
      await repo.list({});

      expect(capturedWhere).toBeDefined();

      const query = db.select().from(tenantOrders).where(capturedWhere as never);
      const { sql, params } = query.toSQL();

      // En consulta general POS no debe filtrar por payment_status en la cláusula WHERE
      expect(sql).not.toContain('"payment_status" =');
      expect(params).not.toContain("paid");
      expect(params).not.toContain("pending");
      // Debe incluir los estados operativos por defecto
      expect(params).toContain("approved");
      expect(params).toContain("preparing");
      expect(params).toContain("ready");
    });

    it("con scope='all' NO filtra payment_status y aplica estados operativos", async () => {
      let capturedWhere: unknown = null;

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation((condition) => {
              capturedWhere = condition;
              return {
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              };
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new OrderRepository(mockTx, context);
      await repo.list({ scope: "all" });

      expect(capturedWhere).toBeDefined();

      const query = db.select().from(tenantOrders).where(capturedWhere as never);
      const { sql, params } = query.toSQL();

      expect(sql).not.toContain('"payment_status" =');
      expect(params).not.toContain("paid");
      expect(params).not.toContain("pending");
      expect(params).toContain("approved");
      expect(params).toContain("preparing");
      expect(params).toContain("ready");
    });

    it("con paymentStatus='pending' explícito filtra payment_status = 'pending'", async () => {
      let capturedWhere: unknown = null;

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation((condition) => {
              capturedWhere = condition;
              return {
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              };
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new OrderRepository(mockTx, context);
      await repo.list({ paymentStatus: "pending" });

      expect(capturedWhere).toBeDefined();

      const query = db.select().from(tenantOrders).where(capturedWhere as never);
      const { sql, params } = query.toSQL();

      expect(sql).toContain('"payment_status" =');
      expect(params).toContain("pending");
    });

    it("con scope='kitchen' incluso si se pasa paymentStatus='pending' fuerza payment_status = 'paid'", async () => {
      let capturedWhere: unknown = null;

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation((condition) => {
              capturedWhere = condition;
              return {
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              };
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new OrderRepository(mockTx, context);
      await repo.list({ scope: "kitchen", paymentStatus: "pending" });

      const query = db.select().from(tenantOrders).where(capturedWhere as never);
      const { params } = query.toSQL();

      // Regla NEVER: jamás devolver órdenes impagas en consultas con scope=kitchen
      expect(params).toContain("paid");
      expect(params).not.toContain("pending");
    });

    it("orderBy en scope=kitchen es FIFO ascendente (createdAt ASC)", async () => {
      let capturedOrderBy: unknown[] = [];

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockImplementation((...args: unknown[]) => {
                capturedOrderBy = args;
                return { limit: vi.fn().mockResolvedValue([]) };
              }),
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const repo = new OrderRepository(mockTx, context);
      await repo.list({ scope: "kitchen" });

      // El KDS debe priorizar las comandas más antiguas: 2 criterios ascendentes
      // (createdAt, id), comparados contra la misma construcción de Drizzle.
      expect(capturedOrderBy.length).toBe(2);
      expect(capturedOrderBy[0]).toEqual(asc(tenantOrders.createdAt));
      expect(capturedOrderBy[1]).toEqual(asc(tenantOrders.id));
    });

    it("retorna y mapea las órdenes hidratadas correctamente", async () => {
      const dummyOrderRow = {
        id: "62d47dd7-d84d-4313-87f1-d0e72dfafafe",
        tenantId,
        locationId,
        cartId: "00000000-0000-4000-8000-000000000001",
        paymentAttemptId: null,
        purchaseNumber: BigInt(1042),
        fulfillmentStatus: "approved",
        paymentStatus: "paid",
        tender: "cash",
        source: "admin_direct",
        customerSnapshot: { name: "Juan Perez" },
        notes: null,
        subtotal: "15000.00",
        discountTotal: "0.00",
        total: "15000.00",
        discountSnapshot: null,
        currency: "ARS",
        pickupPin: "4589",
        estimatedWaitMinutes: 15,
        estimatedReadyAt: new Date("2026-10-05T15:00:00.000Z"),
        paymentExpiresAt: null,
        version: 1,
        approvedAt: new Date("2026-10-05T14:45:00.000Z"),
        deliveredAt: null,
        createdAt: new Date("2026-10-05T14:45:00.000Z"),
        updatedAt: new Date("2026-10-05T14:45:00.000Z"),
      };

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table) => {
            return {
              where: vi.fn().mockImplementation(() => ({
                orderBy: vi.fn().mockImplementation(() => {
                  // Si consulta orders
                  return {
                    limit: vi.fn().mockResolvedValue([dummyOrderRow]),
                  };
                }),
              })),
            };
          }),
        })),
      } as unknown as TenantTransaction;

      // Mock para hydrate (orderLines y orderLineOptions)
      let selectCount = 0;
      mockTx.select = vi.fn().mockImplementation(() => {
        selectCount++;
        if (selectCount === 1) {
          // tenantOrders
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([dummyOrderRow]),
                }),
              }),
            }),
          };
        }
        // orderLines
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      });

      const repo = new OrderRepository(mockTx, context);
      const result = await repo.list({ scope: "kitchen" });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("62d47dd7-d84d-4313-87f1-d0e72dfafafe");
      expect(result.data[0]?.paymentStatus).toBe("paid");
      expect(result.data[0]?.purchaseNumber).toBe("1042");
    });
  });

  describe("PrintJobService.enqueueOrderTicketInTransaction - Gating de Impresión", () => {
    function createMockOrder(paymentStatus: OrderView["paymentStatus"]): OrderView {
      return {
        id: "62d47dd7-d84d-4313-87f1-d0e72dfafafe",
        tenantId,
        locationId,
        cartId: "00000000-0000-4000-8000-000000000001",
        paymentAttemptId: null,
        purchaseNumber: "1042",
        fulfillmentStatus: "approved",
        paymentStatus,
        tender: "cash",
        source: "storefront_cash",
        customer: { name: "Carlos" },
        notes: null,
        lines: [
          {
            id: "line-1",
            sourceItemId: "item-1",
            sourceComboId: null,
            name: "Hamburguesa Doble",
            quantity: 2,
            unitPrice: "5000.00",
            lineTotal: "10000.00",
            imageUrl: null,
            note: null,
            options: [],
          },
        ],
        subtotal: "10000.00",
        discountTotal: "0.00",
        total: "10000.00",
        currency: "ARS",
        version: 1,
        approvedAt: "2026-10-05T14:45:00.000Z",
        deliveredAt: null,
        createdAt: "2026-10-05T14:45:00.000Z",
        updatedAt: "2026-10-05T14:45:00.000Z",
      };
    }

    it("retorna null y no encola trabajo de impresión si order.paymentStatus === 'pending'", async () => {
      const mockTx = {
        select: vi.fn(),
        insert: vi.fn(),
      } as unknown as TenantTransaction;

      const printJobService = new PrintJobService();
      const order = createMockOrder("pending");

      const result = await printJobService.enqueueOrderTicketInTransaction(
        mockTx,
        context,
        order,
      );

      expect(result).toBeNull();
      // No debe interactuar con base de datos en absoluto
      expect(mockTx.select).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it("retorna null para otros estados no abonados ('failed', 'refunded', 'verification_required')", async () => {
      const mockTx = {
        select: vi.fn(),
        insert: vi.fn(),
      } as unknown as TenantTransaction;

      const printJobService = new PrintJobService();

      for (const status of ["failed", "refunded", "verification_required"] as const) {
        const order = createMockOrder(status);
        const result = await printJobService.enqueueOrderTicketInTransaction(
          mockTx,
          context,
          order,
        );
        expect(result).toBeNull();
      }

      expect(mockTx.select).not.toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it("encola trabajo de impresión exitosamente cuando order.paymentStatus === 'paid'", async () => {
      const mockCreatedJob = {
        id: "job-uuid-1",
        tenantId,
        locationId,
        orderId: "62d47dd7-d84d-4313-87f1-d0e72dfafafe",
        status: "pending",
      };

      vi.spyOn(PrintJobRepository.prototype, "tenantPrintingEnabled").mockResolvedValue(true);
      const createSpy = vi
        .spyOn(PrintJobRepository.prototype, "create")
        .mockResolvedValue(mockCreatedJob as never);

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ name: "Mi Restaurante" }]),
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const printJobService = new PrintJobService();
      const order = createMockOrder("paid");

      const result = await printJobService.enqueueOrderTicketInTransaction(
        mockTx,
        context,
        order,
      );

      expect(result).toEqual(mockCreatedJob);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: order.locationId,
          orderId: order.id,
          idempotencyKey: `order:${order.id}:kitchen-ticket`,
          payload: expect.objectContaining({
            orderId: order.id,
            purchaseNumber: order.purchaseNumber,
            tenant: "Mi Restaurante",
            amount: order.total,
          }),
        }),
      );
    });

    it("NO aplica el gating de efectivo a órdenes no-cash impagas (preserva flujos previos)", async () => {
      const mockCreatedJob = { id: "job-uuid-2", tenantId, locationId, status: "pending" };

      vi.spyOn(PrintJobRepository.prototype, "tenantPrintingEnabled").mockResolvedValue(true);
      const createSpy = vi
        .spyOn(PrintJobRepository.prototype, "create")
        .mockResolvedValue(mockCreatedJob as never);

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ name: "Mi Restaurante" }]),
            }),
          }),
        }),
      } as unknown as TenantTransaction;

      const printJobService = new PrintJobService();
      const order = {
        ...createMockOrder("verification_required"),
        tender: "posnet" as const,
        source: "mercadopago_webhook" as const,
      };

      const result = await printJobService.enqueueOrderTicketInTransaction(
        mockTx,
        context,
        order,
      );

      expect(result).toEqual(mockCreatedJob);
      expect(createSpy).toHaveBeenCalled();
    });

    it("retorna null si la impresión está deshabilitada en el tenant aún con paymentStatus === 'paid'", async () => {
      vi.spyOn(PrintJobRepository.prototype, "tenantPrintingEnabled").mockResolvedValue(false);

      const mockTx = {
        select: vi.fn(),
      } as unknown as TenantTransaction;

      const printJobService = new PrintJobService();
      const order = createMockOrder("paid");

      const result = await printJobService.enqueueOrderTicketInTransaction(
        mockTx,
        context,
        order,
      );

      expect(result).toBeNull();
      expect(mockTx.select).not.toHaveBeenCalled();
    });
  });

  describe("OrderQueryService.list() - Validación y Propagación", () => {
    it("propaga scope='kitchen' y paymentStatus='paid' al repositorio", async () => {
      const mockList = vi.fn().mockResolvedValue({ data: [], nextCursor: null });
      vi.spyOn(OrderRepository.prototype, "list").mockImplementation(mockList);

      const service = new OrderQueryService();
      await service.list({
        context,
        scope: "kitchen",
        paymentStatus: "paid",
        status: "approved",
      });

      expect(mockList).toHaveBeenCalledWith({
        scope: "kitchen",
        paymentStatus: "paid",
        status: "approved",
        cursor: undefined,
        limit: undefined,
      });
    });

    it("rechaza scope inválido con OrderValidationError", async () => {
      const service = new OrderQueryService();

      await expect(
        service.list({
          context,
          scope: "invalid_scope",
        }),
      ).rejects.toThrow(OrderValidationError);

      await expect(
        service.list({
          context,
          scope: "invalid_scope",
        }),
      ).rejects.toThrow("Invalid scope.");
    });

    it("rechaza paymentStatus inválido con OrderValidationError", async () => {
      const service = new OrderQueryService();

      await expect(
        service.list({
          context,
          paymentStatus: "not_a_status",
        }),
      ).rejects.toThrow(OrderValidationError);

      await expect(
        service.list({
          context,
          paymentStatus: "not_a_status",
        }),
      ).rejects.toThrow("Invalid payment status.");
    });

    it("acepta scopes válidos ('kitchen', 'all')", async () => {
      const mockList = vi.fn().mockResolvedValue({ data: [], nextCursor: null });
      vi.spyOn(OrderRepository.prototype, "list").mockImplementation(mockList);

      const service = new OrderQueryService();
      await service.list({ context, scope: "kitchen" });
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ scope: "kitchen" }));

      await service.list({ context, scope: "all" });
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ scope: "all" }));
    });

    it("acepta paymentStatus válidos como 'pending', 'paid', 'refunded'", async () => {
      const mockList = vi.fn().mockResolvedValue({ data: [], nextCursor: null });
      vi.spyOn(OrderRepository.prototype, "list").mockImplementation(mockList);

      const service = new OrderQueryService();
      await service.list({ context, paymentStatus: "pending" });
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: "pending" }),
      );

      await service.list({ context, paymentStatus: "refunded" });
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ paymentStatus: "refunded" }),
      );
    });
  });

  describe("GET /api/v1/tenants/:tenantId/orders Route Adapter", () => {
    beforeEach(() => {
      vi.spyOn(tenantAuthority, "administrativeTenantContext").mockResolvedValue(context);
    });

    it("parsea searchParams scope y paymentStatus y los pasa a OrderQueryService", async () => {
      const mockList = vi.fn().mockResolvedValue({ data: [], nextCursor: null });
      vi.spyOn(OrderQueryService.prototype, "list").mockImplementation(mockList);

      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders?scope=kitchen&paymentStatus=paid&status=approved`,
        {
          headers: { "X-Correlation-Id": "corr-route-test" },
        },
      );

      const response = await GET(request, {
        params: Promise.resolve({ tenantId }),
      });

      expect(response.status).toBe(200);
      expect(mockList).toHaveBeenCalledWith({
        context,
        scope: "kitchen",
        paymentStatus: "paid",
        status: "approved",
        cursor: null,
      });
    });

    it("parsea paymentStatus=pending correctamente", async () => {
      const mockList = vi.fn().mockResolvedValue({ data: [], nextCursor: null });
      vi.spyOn(OrderQueryService.prototype, "list").mockImplementation(mockList);

      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders?paymentStatus=pending`,
      );

      const response = await GET(request, {
        params: Promise.resolve({ tenantId }),
      });

      expect(response.status).toBe(200);
      expect(mockList).toHaveBeenCalledWith({
        context,
        scope: null,
        paymentStatus: "pending",
        status: null,
        cursor: null,
      });
    });

    it("devuelve 422 VALIDATION_FAILED cuando scope es inválido", async () => {
      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders?scope=bogus`,
      );

      const response = await GET(request, {
        params: Promise.resolve({ tenantId }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("devuelve 422 VALIDATION_FAILED cuando paymentStatus es inválido", async () => {
      const request = new Request(
        `http://localhost/api/v1/tenants/${tenantId}/orders?paymentStatus=unrecognized`,
      );

      const response = await GET(request, {
        params: Promise.resolve({ tenantId }),
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.code).toBe("VALIDATION_FAILED");
    });
  });
});
