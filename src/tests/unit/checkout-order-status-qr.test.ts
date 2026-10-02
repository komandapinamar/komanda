import { beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import {
  buildCheckoutPayload,
  normalizeOptionalPhone,
} from "@/features/shop/checkout/components/checkout-payload";
import {
  orderTrackingPath,
  orderTrackingUrl,
} from "@/features/shop/checkout/components/order-tracking";

const { withPlatformServiceTransaction } = vi.hoisted(() => ({
  withPlatformServiceTransaction: vi.fn(),
}));
vi.mock("@/db/tenant-transaction", () => ({ withPlatformServiceTransaction }));

import { GET } from "@/app/api/v1/payments/[paymentId]/order-status/route";

const tenantId = "1c5fb634-425c-4a7e-830e-1392d2e3d0ae";
const request = new Request("https://komanda.example/api/v1/payments/pay-1/order-status");
const route = (paymentId: string) => ({ params: Promise.resolve({ paymentId }) });

type QueryRows = Record<string, unknown>[];

/**
 * The handler issues three selects in order: providerResourceRoutes,
 * paymentAttempts, then tenantOrders. Each `limit()` consumes the next queue.
 */
function mockLookupSequence(queries: [QueryRows, QueryRows, QueryRows]) {
  let call = 0;
  withPlatformServiceTransaction.mockImplementation(async (_ctx, callback) =>
    callback({
      select: () => ({
        from: () => {
          const builder = {
            where: () => builder,
            limit: async () => queries[Math.min(call++, queries.length - 1)],
          };
          return builder;
        },
      }),
    }),
  );
}

function approvedRouteRows(): [QueryRows, QueryRows] {
  return [
    [{ tenantId, localResourceId: "attempt-1" }],
    [{ status: "approved" }],
  ];
}

describe("order tracking URL", () => {
  it("builds the path the public tracking page route actually serves", () => {
    expect(orderTrackingPath(tenantId, "order-1")).toBe(
      `/orders/status/${tenantId}/order-1`,
    );
  });

  it("encodes path segments so a crafted id cannot escape the route", () => {
    expect(orderTrackingPath("a/../b", "c?x=1")).toBe(
      "/orders/status/a%2F..%2Fb/c%3Fx%3D1",
    );
  });

  it("uses the canonical base url and tolerates a trailing slash", () => {
    expect(orderTrackingUrl("https://komanda.app/", tenantId, "o1")).toBe(
      `https://komanda.app/orders/status/${tenantId}/o1`,
    );
    expect(orderTrackingUrl("https://komanda.app", tenantId, "o1")).toBe(
      `https://komanda.app/orders/status/${tenantId}/o1`,
    );
  });

  it("produces a scannable QR for the tracking url", async () => {
    const trackingUrl = orderTrackingUrl("https://komanda.app", tenantId, "o1");
    const dataUri = await QRCode.toDataURL(trackingUrl, { margin: 1, width: 200 });
    expect(dataUri.startsWith("data:image/png;base64,")).toBe(true);
  });
});

describe("optional customer phone normalisation", () => {
  it("keeps a plausible number and strips formatting", () => {
    expect(normalizeOptionalPhone("11 2345-6789")).toBe("1123456789");
    expect(normalizeOptionalPhone("+54 9 11 2345 6789")).toBe("5491123456789");
  });

  it("drops input with no plausible number of digits", () => {
    expect(normalizeOptionalPhone(undefined)).toBeUndefined();
    expect(normalizeOptionalPhone(null)).toBeUndefined();
    expect(normalizeOptionalPhone("")).toBeUndefined();
    expect(normalizeOptionalPhone("   ")).toBeUndefined();
    expect(normalizeOptionalPhone("abc")).toBeUndefined();
    expect(normalizeOptionalPhone("12345")).toBeUndefined();
    expect(normalizeOptionalPhone("1".repeat(20))).toBeUndefined();
  });
});

describe("checkout payload", () => {
  const base = { cartId: "cart-1", cartVersion: 3 };

  it("trims the name and omits empty optional fields entirely", () => {
    const payload = buildCheckoutPayload({
      ...base,
      customer: { name: "  Luka  ", phone: "  " },
      notes: "   ",
    });

    expect(payload.customer.name).toBe("Luka");
    expect(payload.customer.phone).toBeUndefined();
    expect(payload.notes).toBeUndefined();
    // The API schema is .strict(): an empty phone/notes must never reach the
    // wire, otherwise Mercado Pago receives payer.phone.number: "".
    const wire = JSON.parse(JSON.stringify(payload));
    expect("phone" in wire.customer).toBe(false);
    expect("notes" in wire).toBe(false);
  });

  it("keeps a valid note and a valid phone", () => {
    const payload = buildCheckoutPayload({
      ...base,
      customer: { name: "Luka", phone: "11 2345 6789" },
      notes: "  sin cebolla  ",
    });

    expect(payload.customer.phone).toBe("1123456789");
    expect(payload.notes).toBe("sin cebolla");
  });
});

describe("GET /api/v1/payments/:paymentId/order-status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports hasCustomerPhone from SQL and echoes tenantId, with no-store", async () => {
    const [routeRows, attemptRows] = approvedRouteRows();
    mockLookupSequence([
      routeRows,
      attemptRows,
      [
        {
          id: "order-1",
          tenantId,
          purchaseNumber: BigInt("42"),
          fulfillmentStatus: "preparing",
          paymentStatus: "paid",
          pickupPin: "7428",
          estimatedWaitMinutes: 18,
          estimatedReadyAt: new Date("2026-09-21T15:45:00.000Z"),
          hasCustomerPhone: true,
        },
      ],
    ]);

    const response = await GET(request, route("pay-1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body).toMatchObject({
      status: "completed",
      orderId: "order-1",
      tenantId,
      purchaseNumber: "42",
      fulfillmentStatus: "preparing",
      pickupPin: "7428",
      hasCustomerPhone: true,
    });
  });

  it("never materialises the customer snapshot into the response", async () => {
    const [routeRows, attemptRows] = approvedRouteRows();
    mockLookupSequence([
      routeRows,
      attemptRows,
      [
        {
          id: "order-1",
          purchaseNumber: BigInt("42"),
          fulfillmentStatus: "approved",
          paymentStatus: "paid",
          pickupPin: "7428",
          estimatedWaitMinutes: null,
          estimatedReadyAt: null,
          hasCustomerPhone: true,
        },
      ],
    ]);

    const body = await (await GET(request, route("pay-1"))).json();
    expect(JSON.stringify(body)).not.toContain("customerSnapshot");
    expect(body.customer).toBeUndefined();
  });

  it("reports hasCustomerPhone false when no order exists yet", async () => {
    const [routeRows, attemptRows] = approvedRouteRows();
    mockLookupSequence([routeRows, attemptRows, []]);

    const response = await GET(request, route("pay-1"));
    const body = await response.json();
    expect(body.status).toBe("pending");
    expect(body.hasCustomerPhone).toBe(false);
    expect(body.orderId).toBeNull();
  });

  it("stays pending and reports no phone when the payment route is unknown", async () => {
    mockLookupSequence([[], [], []]);

    const body = await (await GET(request, route("pay-unknown"))).json();
    expect(body.status).toBe("pending");
    expect(body.tenantId).toBeNull();
    expect(body.hasCustomerPhone).toBe(false);
  });
});