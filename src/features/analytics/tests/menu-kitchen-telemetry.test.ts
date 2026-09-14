import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn(
    async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      return callback({});
    },
  ),
  withPlatformServiceTransaction: vi.fn(
    async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
      return callback({});
    },
  ),
}));

import {
  ingestTelemetryBatchSchema,
  kitchenDelaysSummarySchema,
  peakHoursHeatmapSchema,
  unconvertedProductSchema,
} from "../domain/analytics.schemas";
import {
  calculatePercentile,
  AnalyticsRepository,
} from "../infrastructure/analytics.repository";
import { POST as eventsRouteHandler } from "@/app/api/v1/storefronts/[tenantSlug]/analytics/events/route";
import { PublicTenantNotFoundError } from "@/features/tenancy/application/public-tenant.service";
import { AnalyticsService } from "../application/analytics.service";

describe("Menu Telemetry, Kitchen Delays & Peak Hours Analytics", () => {
  beforeEach(() => {
    vi.stubEnv("KOMANDA_PUBLIC_BASE_URL", "https://api.komanda.test");
  });

  describe("1. Telemetry Ingestion Schemas & Validation", () => {
    const validItemId = "11111111-1111-4000-8000-111111111111";

    it("parses valid batch telemetry payload with multiple events", () => {
      const payload = {
        sessionId: "s_session_12345",
        events: [
          {
            itemId: validItemId,
            surface: "classic" as const,
            eventType: "impression" as const,
            dwellDurationMs: 500,
            exposureId: "exp_1",
          },
          {
            itemId: validItemId,
            surface: "classic" as const,
            eventType: "qualified_view" as const,
            dwellDurationMs: 1000,
            exposureId: "exp_1",
          },
          {
            itemId: validItemId,
            surface: "classic" as const,
            eventType: "cart_add" as const,
            dwellDurationMs: 0,
          },
        ],
      };

      const parsed = ingestTelemetryBatchSchema.parse(payload);
      expect(parsed.sessionId).toBe("s_session_12345");
      expect(parsed.events).toHaveLength(3);
      expect(parsed.events[0].eventType).toBe("impression");
      expect(parsed.events[1].eventType).toBe("qualified_view");
      expect(parsed.events[2].eventType).toBe("cart_add");
    });

    it("supports reels surface and dwell_heartbeat events", () => {
      const payload = {
        sessionId: "s_reels_999",
        events: [
          {
            itemId: validItemId,
            surface: "reels" as const,
            eventType: "dwell_heartbeat" as const,
            dwellDurationMs: 5000,
          },
        ],
      };

      const parsed = ingestTelemetryBatchSchema.parse(payload);
      expect(parsed.events[0].surface).toBe("reels");
      expect(parsed.events[0].eventType).toBe("dwell_heartbeat");
      expect(parsed.events[0].dwellDurationMs).toBe(5000);
    });

    it("rejects malformed payload with invalid UUID", () => {
      const payload = {
        sessionId: "s_test",
        events: [
          {
            itemId: "not-a-valid-uuid",
            surface: "classic",
            eventType: "impression",
          },
        ],
      };

      expect(() => ingestTelemetryBatchSchema.parse(payload)).toThrow();
    });

    it("rejects negative dwell duration", () => {
      const payload = {
        sessionId: "s_test",
        events: [
          {
            itemId: validItemId,
            surface: "classic",
            eventType: "impression",
            dwellDurationMs: -100,
          },
        ],
      };

      expect(() => ingestTelemetryBatchSchema.parse(payload)).toThrow();
    });

    it("rejects empty events array", () => {
      const payload = {
        sessionId: "s_test",
        events: [],
      };

      expect(() => ingestTelemetryBatchSchema.parse(payload)).toThrow();
    });

    it("rejects invalid event type", () => {
      const payload = {
        sessionId: "s_test",
        events: [
          {
            itemId: validItemId,
            surface: "classic",
            eventType: "unknown_custom_event",
          },
        ],
      };

      expect(() => ingestTelemetryBatchSchema.parse(payload)).toThrow();
    });
  });

  describe("2. HTTP Route Handler (POST /analytics/events)", () => {
    it("returns 200 with count for valid batch telemetry payload", async () => {
      vi.spyOn(AnalyticsService.prototype, "ingestTelemetryBatch").mockResolvedValueOnce({
        count: 2,
      });

      const request = new Request("https://api.komanda.test/api/v1/storefronts/pizzeria-roma/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "s_roma_1",
          events: [
            {
              itemId: "11111111-1111-4000-8000-111111111111",
              surface: "classic",
              eventType: "qualified_view",
              dwellDurationMs: 1000,
            },
            {
              itemId: "11111111-1111-4000-8000-111111111111",
              surface: "classic",
              eventType: "cart_add",
              dwellDurationMs: 0,
            },
          ],
        }),
      });

      const response = await eventsRouteHandler(request, {
        params: Promise.resolve({ tenantSlug: "pizzeria-roma" }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(2);
    });

    it("returns 400 validation error on malformed batch schema", async () => {
      const request = new Request("https://api.komanda.test/api/v1/storefronts/pizzeria-roma/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "s_roma_1",
          events: [
            {
              itemId: "invalid-uuid",
              surface: "classic",
              eventType: "invalid-event",
            },
          ],
        }),
      });

      const response = await eventsRouteHandler(request, {
        params: Promise.resolve({ tenantSlug: "pizzeria-roma" }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_FAILED");
      expect(json.status).toBe(400);
    });

    it("returns 404 RFC 7807 problem details when tenant slug does not exist", async () => {
      vi.spyOn(AnalyticsService.prototype, "ingestTelemetryBatch").mockRejectedValueOnce(
        new PublicTenantNotFoundError("Storefront not found."),
      );

      const request = new Request("https://api.komanda.test/api/v1/storefronts/non-existent-restaurant/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "s_test",
          events: [
            {
              itemId: "11111111-1111-4000-8000-111111111111",
              surface: "classic",
              eventType: "qualified_view",
            },
          ],
        }),
      });

      const response = await eventsRouteHandler(request, {
        params: Promise.resolve({ tenantSlug: "non-existent-restaurant" }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.code).toBe("RESOURCE_NOT_FOUND");
    });

    it("maintains backward compatibility with legacy session summary payload", async () => {
      vi.spyOn(AnalyticsService.prototype, "recordStorefrontSession").mockResolvedValueOnce({
        id: "session-uuid-123",
      } as never);

      const request = new Request("https://api.komanda.test/api/v1/storefronts/pizzeria-roma/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionKey: "s_legacy_key",
          deviceType: "mobile",
          dwellTimeSeconds: 45,
          categoryDwellMap: { "cat-1": 30 },
          itemViewsMap: {},
          cartCreated: false,
          orderPlaced: false,
        }),
      });

      const response = await eventsRouteHandler(request, {
        params: Promise.resolve({ tenantSlug: "pizzeria-roma" }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.sessionId).toBe("session-uuid-123");
    });
  });

  describe("3. Percentile Calculation Logic", () => {
    it("returns 0 for empty array", () => {
      expect(calculatePercentile([], 0.5)).toBe(0);
      expect(calculatePercentile([], 0.9)).toBe(0);
    });

    it("calculates exact median (p50) for odd length arrays", () => {
      // 5 values: 10, 20, 30, 40, 50 -> median is 30
      expect(calculatePercentile([50, 10, 30, 20, 40], 0.5)).toBe(30);
    });

    it("interpolates median (p50) for even length arrays", () => {
      // 4 values: 10, 20, 30, 40 -> median is (20 + 30) / 2 = 25
      expect(calculatePercentile([40, 10, 30, 20], 0.5)).toBe(25);
    });

    it("calculates 90th percentile accurately", () => {
      // 10 values: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      // Index for p90 is 9 * 0.9 = 8.1 -> interpolated between 90 and 100: 90 + 0.1*(100-90) = 91
      expect(calculatePercentile(values, 0.9)).toBe(91);
    });
  });

  describe("4. Kitchen Delays & Pending Orders Invariants", () => {
    it("calculates waiting and prep durations and excludes corrupted negative durations", async () => {
      const baseTime = new Date("2026-09-10T12:00:00.000Z");

      // Mock orders:
      // Order 1: Approved at 12:00, Preparing at 12:10 (+10m wait), Ready at 12:25 (+15m prep) -> Total: 25m
      // Order 2: Approved at 12:05, Preparing at 12:25 (+20m wait), Ready at 12:50 (+25m prep) -> Total: 45m
      // Order 3: Corrupted timestamps (Preparing earlier than Approved) -> Excluded from waiting
      // Order 4: Cancelled while in approved -> Cancelled before cooking
      const mockOrders = [
        {
          id: "order-1",
          purchaseNumber: "101",
          fulfillmentStatus: "ready",
          paymentStatus: "paid",
          approvedAt: baseTime,
          createdAt: baseTime,
          total: "5000.00",
        },
        {
          id: "order-2",
          purchaseNumber: "102",
          fulfillmentStatus: "ready",
          paymentStatus: "paid",
          approvedAt: new Date(baseTime.getTime() + 5 * 60000),
          createdAt: new Date(baseTime.getTime() + 5 * 60000),
          total: "8000.00",
        },
        {
          id: "order-3",
          purchaseNumber: "103",
          fulfillmentStatus: "ready",
          paymentStatus: "paid",
          approvedAt: new Date(baseTime.getTime() + 30 * 60000),
          createdAt: new Date(baseTime.getTime() + 30 * 60000),
          total: "3000.00",
        },
        {
          id: "order-4",
          purchaseNumber: "104",
          fulfillmentStatus: "cancelled",
          paymentStatus: "refunded",
          approvedAt: baseTime,
          createdAt: baseTime,
          total: "4000.00",
        },
      ];

      const mockEvents = [
        // Order 1
        {
          orderId: "order-1",
          toStatus: "preparing",
          occurredAt: new Date(baseTime.getTime() + 10 * 60000),
        },
        {
          orderId: "order-1",
          toStatus: "ready",
          occurredAt: new Date(baseTime.getTime() + 25 * 60000),
        },
        // Order 2
        {
          orderId: "order-2",
          toStatus: "preparing",
          occurredAt: new Date(baseTime.getTime() + 25 * 60000),
        },
        {
          orderId: "order-2",
          toStatus: "ready",
          occurredAt: new Date(baseTime.getTime() + 50 * 60000),
        },
        // Order 3 (corrupted: preparing occurred BEFORE approved)
        {
          orderId: "order-3",
          toStatus: "preparing",
          occurredAt: new Date(baseTime.getTime() + 15 * 60000), // -15m wait -> negative!
        },
        {
          orderId: "order-3",
          toStatus: "ready",
          occurredAt: new Date(baseTime.getTime() + 35 * 60000),
        },
      ];

      // Pending order in preparing state
      const mockPendingOrders = [
        {
          id: "00000000-0000-4000-8000-000000000105",
          purchaseNumber: "105",
          fulfillmentStatus: "preparing",
          approvedAt: new Date(Date.now() - 22 * 60000), // 22 min age
          createdAt: new Date(Date.now() - 22 * 60000),
          total: "6500.00",
        },
        {
          id: "00000000-0000-4000-8000-000000000106",
          purchaseNumber: "106",
          fulfillmentStatus: "approved",
          approvedAt: new Date(Date.now() - 10 * 60000), // 10 min age
          createdAt: new Date(Date.now() - 10 * 60000),
          total: "3200.00",
        },
      ];

      let queryCounter = 0;
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              queryCounter++;
              if (queryCounter === 1) {
                // Completed/all orders query
                return Promise.resolve(mockOrders);
              }
              if (queryCounter === 2) {
                // Events query
                return {
                  orderBy: vi.fn(() => Promise.resolve(mockEvents)),
                };
              }
              if (queryCounter === 3) {
                // Pending orders query
                return Promise.resolve(mockPendingOrders);
              }
              return Promise.resolve([]);
            }),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, "tenant-test-1");
      const result = await repo.getKitchenDelaysSummary(
        new Date(baseTime.getTime() - 3600000),
        new Date(baseTime.getTime() + 86400000),
      );

      // Validation against Zod schema
      expect(() => kitchenDelaysSummarySchema.parse(result)).not.toThrow();

      // Waiting duration:
      // Order 1: 10m
      // Order 2: 20m
      // Order 3 was negative (excluded)
      // Array: [10, 20] -> p50 = 15m, p90 = 19m
      expect(result.waitingMinutes.sampleSize).toBe(2);
      expect(result.waitingMinutes.p50).toBe(15);
      expect(result.waitingMinutes.p90).toBe(19);

      // Preparation duration:
      // Order 1: 15m
      // Order 2: 25m
      // Order 3: 35 - 15 = 20m
      // Array: [15, 20, 25] -> p50 = 20m, p90 = 24m
      expect(result.preparationMinutes.sampleSize).toBe(3);
      expect(result.preparationMinutes.p50).toBe(20);

      // Cancelled before cooking: Order 4
      expect(result.cancelledBeforeCookingCount).toBe(1);

      // Pending orders sorted descending by age
      expect(result.pendingOrders).toHaveLength(2);
      expect(result.pendingOrders[0].orderId).toBe("00000000-0000-4000-8000-000000000105");
      expect(result.pendingOrders[0].waitingAgeMinutes).toBeGreaterThanOrEqual(21);
      expect(result.pendingOrders[1].orderId).toBe("00000000-0000-4000-8000-000000000106");
      expect(result.pendingOrders[1].waitingAgeMinutes).toBeGreaterThanOrEqual(9);
    });
  });

  describe("5. Peak Hours 24x7 Heatmap", () => {
    it("generates complete 7x24 matrix (168 cells) and identifies peak slot", async () => {
      // Create test orders on different days/hours:
      // Order 1: Monday at 13:00 (dayOfWeek: 0, hour: 13), $15000.00
      // Order 2: Monday at 13:00 (dayOfWeek: 0, hour: 13), $12000.00 -> Total Monday 13:00 = 2 orders, $27000.00 (PEAK)
      // Order 3: Friday at 21:00 (dayOfWeek: 4, hour: 21), $8000.00 -> 1 order
      // Order 4: Sunday at 20:00 (dayOfWeek: 6, hour: 20), $5000.00 -> 1 order

      // 2026-09-07 is a Monday!
      // 2026-09-11 is a Friday!
      // 2026-09-13 is a Sunday!
      const mockOrders = [
        {
          createdAt: new Date("2026-09-07T13:15:00.000-03:00"),
          total: "15000.00",
        },
        {
          createdAt: new Date("2026-09-07T13:45:00.000-03:00"),
          total: "12000.00",
        },
        {
          createdAt: new Date("2026-09-11T21:30:00.000-03:00"),
          total: "8000.00",
        },
        {
          createdAt: new Date("2026-09-13T20:10:00.000-03:00"),
          total: "5000.00",
        },
      ];

      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(mockOrders)),
          })),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, "tenant-test-1");
      const heatmap = await repo.getPeakHoursHeatmap(
        new Date("2026-09-07T00:00:00.000Z"),
        new Date("2026-09-13T23:59:59.000Z"),
      );

      // Validate against schema
      expect(() => peakHoursHeatmapSchema.parse(heatmap)).not.toThrow();

      // Invariant: Exactly 168 cells
      expect(heatmap.cells).toHaveLength(168);

      // Maximum orders in a single slot is 2 (Monday 13:00)
      expect(heatmap.maxOrdersInSlot).toBe(2);

      // Find Monday 13:00 cell
      const monday13Cell = heatmap.cells.find(
        (c) => c.dayOfWeek === 0 && c.hour === 13,
      );
      expect(monday13Cell).toBeDefined();
      expect(monday13Cell?.orderCount).toBe(2);
      expect(monday13Cell?.revenue).toBe("27000.00");
      expect(monday13Cell?.isPeak).toBe(true);

      // Empty slots must be zeroed out
      const tuesday00Cell = heatmap.cells.find(
        (c) => c.dayOfWeek === 1 && c.hour === 0,
      );
      expect(tuesday00Cell?.orderCount).toBe(0);
      expect(tuesday00Cell?.revenue).toBe("0.00");
      expect(tuesday00Cell?.isPeak).toBe(false);

      // Busiest day
      expect(heatmap.busiestDay).toBe("Lunes");
      expect(heatmap.busiestHour).toBe(13);
    });
  });

  describe("6. Most Viewed Without Sales (M-32)", () => {
    it("ranks products with >= 10 views and <= 5% conversion and assigns gastronomic suggestions", async () => {
      const itemHighViewsNoSales = "11111111-1111-4000-8000-111111111111"; // 50 views, 0 purchases (0% conv) -> "Probar foto nueva"
      const itemHighViewsLowSales = "22222222-2222-4000-8000-222222222222"; // 40 views, 1 purchase (2.5% conv) -> "Revisar precio"
      const itemNoPhoto = "33333333-3333-4000-8000-333333333333"; // 20 views, 0 purchases, no image -> "Falta foto en carta"
      const itemHighConversion = "44444444-4444-4000-8000-444444444444"; // 20 views, 4 purchases (20% conv) -> Filtered out!
      const itemLowViews = "55555555-5555-4000-8000-555555555555"; // 5 views -> Filtered out!

      const mockViews = [
        { itemId: itemHighViewsNoSales, viewsCount: 50 },
        { itemId: itemHighViewsLowSales, viewsCount: 40 },
        { itemId: itemNoPhoto, viewsCount: 20 },
        { itemId: itemHighConversion, viewsCount: 20 },
        { itemId: itemLowViews, viewsCount: 5 },
      ];

      const mockCatalogInfo = [
        {
          id: itemHighViewsNoSales,
          name: "Hamburguesa Trufada",
          price: "12000.00",
          imageAssetId: "img-1",
          categoryName: "Hamburguesas",
          mediaUrl: "https://cdn.komanda.test/burger.jpg",
        },
        {
          id: itemHighViewsLowSales,
          name: "Pizza Napolitana Premium",
          price: "18000.00",
          imageAssetId: "img-2",
          categoryName: "Pizzas",
          mediaUrl: "https://cdn.komanda.test/pizza.jpg",
        },
        {
          id: itemNoPhoto,
          name: "Postre Tiramisú Especial",
          price: "6500.00",
          imageAssetId: null,
          categoryName: "Postres",
          mediaUrl: null,
        },
        {
          id: itemHighConversion,
          name: "Papas Fritas",
          price: "4000.00",
          imageAssetId: "img-4",
          categoryName: "Guarniciones",
          mediaUrl: "https://cdn.komanda.test/fries.jpg",
        },
      ];

      const mockPurchases = [
        { sourceItemId: itemHighViewsNoSales, purchasesCount: 0 },
        { sourceItemId: itemHighViewsLowSales, purchasesCount: 1 },
        { sourceItemId: itemNoPhoto, purchasesCount: 0 },
        { sourceItemId: itemHighConversion, purchasesCount: 4 },
      ];

      let queryStep = 0;
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              queryStep++;
              if (queryStep === 1) {
                // Views query
                return {
                  groupBy: vi.fn(() => Promise.resolve(mockViews)),
                };
              }
              return Promise.resolve([]);
            }),
            leftJoin: vi.fn().mockReturnThis(),
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                groupBy: vi.fn(() => Promise.resolve(mockPurchases)),
              })),
            })),
          })),
        })),
      };

      // Mock the second query (catalog items with left joins)
      (mockTx.select as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            groupBy: () => Promise.resolve(mockViews),
          }),
        }),
      }));
      (mockTx.select as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        from: () => ({
          leftJoin: () => ({
            leftJoin: () => ({
              where: () => Promise.resolve(mockCatalogInfo),
            }),
          }),
        }),
      }));
      (mockTx.select as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              groupBy: () => Promise.resolve(mockPurchases),
            }),
          }),
        }),
      }));

      const repo = new AnalyticsRepository(mockTx as never, "tenant-test-1");
      const unconverted = await repo.getUnconvertedProducts(
        new Date("2026-09-01"),
        new Date("2026-09-10"),
      );

      // Must validate schema
      expect(() => unconverted.forEach((p) => unconvertedProductSchema.parse(p))).not.toThrow();

      // Exactly 3 products:
      // itemHighConversion (20% conv > 5%) is excluded
      // itemLowViews (5 views < 10) is excluded
      expect(unconverted).toHaveLength(3);

      // Ranked by views descending: 50 -> 40 -> 20
      expect(unconverted[0].itemId).toBe(itemHighViewsNoSales);
      expect(unconverted[0].qualifiedViews).toBe(50);
      expect(unconverted[0].purchasesCount).toBe(0);
      expect(unconverted[0].conversionRate).toBe(0);
      expect(unconverted[0].suggestion).toBe("Probar foto nueva");

      expect(unconverted[1].itemId).toBe(itemHighViewsLowSales);
      expect(unconverted[1].qualifiedViews).toBe(40);
      expect(unconverted[1].purchasesCount).toBe(1);
      expect(unconverted[1].conversionRate).toBe(2.5);
      expect(unconverted[1].suggestion).toBe("Revisar precio");

      expect(unconverted[2].itemId).toBe(itemNoPhoto);
      expect(unconverted[2].qualifiedViews).toBe(20);
      expect(unconverted[2].suggestion).toBe("Falta foto en carta");
    });
  });

  describe("7. Invariant: Zero Emojis Across Analytics System", () => {
    it("ensures suggestions, status labels and text contain no emojis", () => {
      const suggestions = [
        "Probar foto nueva",
        "Revisar precio",
        "Falta foto en carta",
      ];
      const statusLabels = ["En cocina", "En cola", "Pico", "Normal"];

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

      for (const text of [...suggestions, ...statusLabels]) {
        expect(emojiRegex.test(text)).toBe(false);
      }
    });

    it("verifies AnalyticsRepository.insertItemEvents persists rows correctly", async () => {
      const insertedRows: Array<Record<string, unknown>> = [];
      const mockTx = {
        insert: vi.fn(() => ({
          values: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            insertedRows.push(...rows);
            return Promise.resolve();
          }),
        })),
      };

      const repo = new AnalyticsRepository(mockTx as never, "tenant-1");
      const result = await repo.insertItemEvents("loc-1", {
        sessionId: "sess-1",
        events: [
          {
            itemId: "11111111-1111-4000-8000-111111111111",
            surface: "classic",
            eventType: "qualified_view",
            dwellDurationMs: 1000,
            exposureId: "exp-1",
          },
        ],
      });

      expect(result.count).toBe(1);
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0].locationId).toBe("loc-1");
      expect(insertedRows[0].surface).toBe("classic");
      expect(insertedRows[0].eventType).toBe("qualified_view");
    });
  });
});
