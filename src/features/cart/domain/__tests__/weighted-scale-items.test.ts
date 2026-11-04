import { describe, expect, it, vi, beforeEach } from "vitest";
import { withTenantTransaction } from "@/db/tenant-transaction";
import {
  isScaleEan13Prefix,
  normalizePluCode,
  parseScaleEan13,
} from "@/features/catalog/domain/catalog.rules";
import {
  CartRevalidationError,
  revalidateCartSelection,
  type RevalidationCatalog,
} from "@/features/cart/domain/cart.rules";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { kioskPaymentErrorResponse } from "@/features/payments/web/kiosk-payment-http";
import { BarcodeLookupService } from "@/features/catalog/application/barcode-lookup.service";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import type { TenantTransaction } from "@/db/tenant-transaction";

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_context, callback) => callback({})),
}));

const mockFindWeightedItemByPlu = vi.fn();
const mockFindItemByBarcode = vi.fn();

vi.mock("@/features/catalog/infrastructure/catalog.repository", () => ({
  CatalogRepository: vi.fn().mockImplementation(function () {
    return {
      findWeightedItemByPlu: mockFindWeightedItemByPlu,
      findItemByBarcode: mockFindItemByBarcode,
    };
  }),
}));

describe("Weighted scale items — EAN-13 parser, PLU normalization, HTTP, Lookup & Order Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizePluCode", () => {
    it("normalizes short PLU codes to 5 zero-padded digits", () => {
      expect(normalizePluCode("123")).toBe("00123");
      expect(normalizePluCode("00123")).toBe("00123");
      expect(normalizePluCode("456")).toBe("00456");
    });

    it("extracts D3-D7 when a 13-digit scale barcode (20..29) is passed", () => {
      expect(normalizePluCode("2000123024509")).toBe("00123");
      expect(normalizePluCode("2900456032004")).toBe("00456");
    });

    it("returns empty string for non-numeric or all-zero PLU inputs", () => {
      expect(normalizePluCode("abc")).toBe("");
      expect(normalizePluCode("00000")).toBe("");
      expect(normalizePluCode("0")).toBe("");
      expect(normalizePluCode("   ")).toBe("");
    });
  });

  describe("parseScaleEan13", () => {
    it("parses valid EAN-13 scale barcode (2000123024509 -> PLU 00123, subtotal 2450.00)", () => {
      const parsed = parseScaleEan13("2000123024509");
      expect(parsed).toEqual({
        pluCode: "00123",
        calculatedSubtotal: "2450.00",
      });
    });

    it("parses second valid EAN-13 scale barcode for same PLU with different amount (2000123018003 -> 1800.00)", () => {
      const parsed = parseScaleEan13("2000123018003");
      expect(parsed).toEqual({
        pluCode: "00123",
        calculatedSubtotal: "1800.00",
      });
    });

    it("parses unregistered PLU scale barcode (2000456032004 -> PLU 00456, subtotal 3200.00)", () => {
      const parsed = parseScaleEan13("2000456032004");
      expect(parsed).toEqual({
        pluCode: "00456",
        calculatedSubtotal: "3200.00",
      });
    });

    it("rejects scale barcode with invalid Modulo-10 check digit (2000123024500)", () => {
      expect(isScaleEan13Prefix("2000123024500")).toBe(true);
      expect(parseScaleEan13("2000123024500")).toBeNull();
    });

    it("rejects scale barcode with zero amount (2000123000008)", () => {
      expect(isScaleEan13Prefix("2000123000008")).toBe(true);
      expect(parseScaleEan13("2000123000008")).toBeNull();
    });

    it("returns null for standard non-scale EAN-13 barcodes", () => {
      expect(isScaleEan13Prefix("7790895000997")).toBe(false);
      expect(parseScaleEan13("7790895000997")).toBeNull();
    });
  });

  describe("revalidateCartSelection", () => {
    const weightedCatalog: RevalidationCatalog = {
      status: "active",
      itemType: "weighted",
      price: "12000.00",
      currency: "ARS",
      addonGroups: [],
    };

    const unitCatalog: RevalidationCatalog = {
      status: "active",
      itemType: "unit",
      price: "1500.00",
      currency: "ARS",
      addonGroups: [],
    };

    it("accepts calculatedSubtotal for weighted item with quantity = 1", () => {
      const result = revalidateCartSelection(
        {
          kind: "item",
          resourceId: "00000000-0000-4000-8000-000000000001",
          quantity: 1,
          optionIds: [],
          calculatedSubtotal: "2450.00",
        },
        weightedCatalog,
      );

      expect(result.itemType).toBe("weighted");
      expect(result.unitPriceCents).toBe(245000);
      expect(result.options).toEqual([]);
    });

    it("rejects calculatedSubtotal when sent for a standard unit item", () => {
      expect(() =>
        revalidateCartSelection(
          {
            kind: "item",
            resourceId: "00000000-0000-4000-8000-000000000002",
            quantity: 1,
            optionIds: [],
            calculatedSubtotal: "10.00",
          },
          unitCatalog,
        ),
      ).toThrow(CartRevalidationError);
    });

    it("rejects weighted item when calculatedSubtotal is missing or zero", () => {
      expect(() =>
        revalidateCartSelection(
          {
            kind: "item",
            resourceId: "00000000-0000-4000-8000-000000000001",
            quantity: 1,
            optionIds: [],
          },
          weightedCatalog,
        ),
      ).toThrow(CartRevalidationError);

      expect(() =>
        revalidateCartSelection(
          {
            kind: "item",
            resourceId: "00000000-0000-4000-8000-000000000001",
            quantity: 1,
            optionIds: [],
            calculatedSubtotal: "0.00",
          },
          weightedCatalog,
        ),
      ).toThrow(CartRevalidationError);
    });

    it("rejects weighted item when quantity is greater than 1 or optionIds are passed", () => {
      expect(() =>
        revalidateCartSelection(
          {
            kind: "item",
            resourceId: "00000000-0000-4000-8000-000000000001",
            quantity: 2,
            optionIds: [],
            calculatedSubtotal: "2450.00",
          },
          weightedCatalog,
        ),
      ).toThrow(CartRevalidationError);

      expect(() =>
        revalidateCartSelection(
          {
            kind: "item",
            resourceId: "00000000-0000-4000-8000-000000000001",
            quantity: 1,
            optionIds: ["00000000-0000-4000-8000-000000000099"],
            calculatedSubtotal: "2450.00",
          },
          weightedCatalog,
        ),
      ).toThrow(CartRevalidationError);
    });
  });

  describe("HTTP 400 mapping for CartRevalidationError", () => {
    it("orderErrorResponse maps CartRevalidationError to HTTP 400 CART_REVALIDATION_FAILED", async () => {
      const res = orderErrorResponse(
        new CartRevalidationError("calculatedSubtotal is not allowed for unit items."),
        "corr-1",
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("CART_REVALIDATION_FAILED");
    });

    it("kioskPaymentErrorResponse maps CartRevalidationError to HTTP 400 CART_REVALIDATION_FAILED", async () => {
      const res = kioskPaymentErrorResponse(
        new CartRevalidationError("calculatedSubtotal is not allowed for unit items."),
        "corr-1",
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("CART_REVALIDATION_FAILED");
    });
  });

  describe("BarcodeLookupService.lookup scale & PLU isolation", () => {
    const context = createVerifiedTenantContext({
      tenantId: "00000000-0000-4000-8000-000000000001",
      locationId: "00000000-0000-4000-8000-000000000002",
      correlationId: "corr-lookup-1",
      source: "administrative",
      actor: { kind: "system", process: "kiosk" },
    });

    it("resolves 20..29 scale barcode by PLU in tenant and never calls external fetch", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      mockFindWeightedItemByPlu.mockResolvedValueOnce({
        id: "item-w-1",
        name: "Queso Tybo",
        price: "12000.00",
        currency: "ARS",
        itemType: "weighted",
        barcode: "00123",
        isGeneric: false,
        genericIcon: null,
        trackStock: false,
        stockQuantity: 0,
        status: "active",
      });

      const service = new BarcodeLookupService();
      const result = await service.lookup(context, "2000123024509");

      expect(mockFindWeightedItemByPlu).toHaveBeenCalledWith("00123");
      expect(result).toEqual({
        source: "tenant",
        item: expect.objectContaining({
          id: "item-w-1",
          itemType: "weighted",
          barcode: "00123",
        }),
      });
      expect(fetchSpy).not.toHaveBeenCalled();

      // Unregistered scale barcode short-circuits without calling fetch
      mockFindWeightedItemByPlu.mockResolvedValueOnce(null);
      const notFound = await service.lookup(context, "2000456032004");
      expect(notFound).toEqual({ source: "none", suggestion: null });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does not return a weighted item when a raw 5-digit PLU is queried on the non-scale path", async () => {
      const fetchSpy = vi.fn(async () => new Response("{}", { status: 404 }));
      vi.stubGlobal("fetch", fetchSpy);

      vi.mocked(withTenantTransaction).mockImplementationOnce(async (_ctx, cb) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValueOnce([]),
              }),
            }),
          }),
        };
        return cb(tx as unknown as TenantTransaction);
      });

      mockFindItemByBarcode.mockResolvedValueOnce({
        id: "item-w-1",
        name: "Queso Tybo",
        price: "12000.00",
        currency: "ARS",
        itemType: "weighted",
        barcode: "00123",
        isGeneric: false,
        genericIcon: null,
        trackStock: false,
        stockQuantity: 0,
        status: "active",
      });

      const service = new BarcodeLookupService();
      const result = await service.lookup(context, "00123");

      expect(result).toEqual({ source: "none", suggestion: null });
    });
  });

  describe("OrderRepository.createFromCartSnapshot weighted item persistence & stock skip", () => {
    it("skips stockQuantity deduction for weighted lines and persists itemType = 'weighted' in orderLines", async () => {
      const context = createVerifiedTenantContext({
        tenantId: "00000000-0000-4000-8000-000000000001",
        locationId: "00000000-0000-4000-8000-000000000002",
        correlationId: "corr-order-1",
        source: "administrative",
        actor: { kind: "system", process: "kiosk" },
      });

      const insertedOrderLines: Array<Record<string, unknown>> = [];
      const updateSpy = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const mockOrderRecord = {
        id: "ord-1",
        tenantId: context.tenantId,
        locationId: context.locationId ?? "00000000-0000-4000-8000-000000000002",
        cartId: "cart-1",
        paymentAttemptId: null,
        purchaseNumber: BigInt(101),
        source: "admin_direct" as const,
        fulfillmentStatus: "approved" as const,
        paymentStatus: "pending" as const,
        tender: "cash" as const,
        customerSnapshot: { name: "Cliente" },
        notes: null,
        subtotal: "2450.00",
        discountTotal: "0.00",
        total: "2450.00",
        discountSnapshot: null,
        pickupPin: "1234",
        estimatedWaitMinutes: 15,
        estimatedReadyAt: new Date(),
        paymentExpiresAt: null,
        currency: "ARS",
        idempotencyKey: "idem-order-1",
        approvedAt: new Date(),
        deliveredAt: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const selectMock = vi.fn()
        // 1. findByIdempotencyKey -> []
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        })
        // 2. cartCheck -> [{ status: 'validated' }]
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: async () => [{ status: "validated" }],
            }),
          }),
        })
        // 3. activeOrdersRow -> [{ count: 0 }]
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [{ count: 0 }],
          }),
        })
        // 4. hydrate orderLines
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  id: "oline-1",
                  tenantId: context.tenantId,
                  orderId: "ord-1",
                  sourceItemId: "item-w-1",
                  sourceComboId: null,
                  itemType: "weighted",
                  name: "Queso Tybo",
                  quantity: 1,
                  unitPrice: "2450.00",
                  lineTotal: "2450.00",
                  imageUrl: null,
                  note: null,
                  createdAt: new Date(),
                },
              ],
            }),
          }),
        })
        // 5. hydrate orderLineOptions
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [],
          }),
        });

      let insertCall = 0;
      const insertMock = vi.fn().mockImplementation(() => {
        insertCall++;
        return {
          values: (val: Record<string, unknown>) => {
            if (insertCall === 2) {
              insertedOrderLines.push(val);
            }
            return {
              returning: async () => {
                if (insertCall === 1) return [mockOrderRecord];
                if (insertCall === 2) return [{ id: "oline-1" }];
                return [
                  {
                    id: "evt-1",
                    orderId: "ord-1",
                    sequence: BigInt(1),
                    eventType: "order.created",
                    fromStatus: null,
                    toStatus: "approved",
                    metadata: {},
                    occurredAt: new Date(),
                  },
                ];
              },
            };
          },
        };
      });

      const tx = {
        execute: vi.fn(async () => ({ rows: [{ current_value: "101" }] })),
        select: selectMock,
        insert: insertMock,
        update: updateSpy,
      } as unknown as TenantTransaction;

      const repo = new OrderRepository(tx, context);
      const { order, created } = await repo.createFromCartSnapshot({
        cart: {
          id: "cart-1",
          tenantId: context.tenantId,
          locationId: context.locationId ?? "00000000-0000-4000-8000-000000000002",
          status: "validated",
          currency: "ARS",
          subtotal: "2450.00",
          discountTotal: "0.00",
          total: "2450.00",
          appliedDiscountCodeId: null,
          discountMetadata: null,
          catalogRevision: 1,
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lines: [
            {
              id: "cline-1",
              tenantId: context.tenantId,
              cartId: "cart-1",
              itemId: "item-w-1",
              comboId: null,
              itemType: "weighted",
              quantity: 1,
              nameSnapshot: "Queso Tybo",
              unitPriceSnapshot: "2450.00",
              lineTotal: "2450.00",
              imageUrlSnapshot: null,
              note: null,
              createdAt: new Date(),
              options: [],
            },
          ],
        },
        source: "admin_direct",
        paymentStatus: "pending",
        tender: "cash",
        customer: { name: "Cliente" },
        idempotencyKey: "idem-order-1",
      });

      expect(created).toBe(true);
      // updateSpy was only called once (to mark cart status='converted'), never on catalogItems stock deduction
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(insertedOrderLines).toHaveLength(1);
      expect(insertedOrderLines[0]).toMatchObject({
        sourceItemId: "item-w-1",
        itemType: "weighted",
        quantity: 1,
        unitPrice: "2450.00",
        lineTotal: "2450.00",
      });
      expect(order.lines[0]?.itemType).toBe("weighted");
    });
  });
});
