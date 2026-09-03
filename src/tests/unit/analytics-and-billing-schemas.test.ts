import { describe, expect, it } from "vitest";
import {
  recordStorefrontSessionSchema,
  analyticsDateFilterSchema,
} from "@/features/analytics/domain/analytics.schemas";
import {
  issueBillingDocumentSchema,
  topProductsFilterSchema,
} from "@/features/billing/domain/billing.schemas";

describe("analytics & billing domain schemas", () => {
  it("validates storefront session inputs correctly", () => {
    const valid = recordStorefrontSessionSchema.parse({
      sessionKey: "session-123-abc",
      deviceType: "mobile",
      dwellTimeSeconds: 45,
      categoryDwellMap: {
        "cat-burgers": 30,
        "cat-drinks": 15,
      },
      cartCreated: true,
      orderPlaced: false,
    });

    expect(valid.sessionKey).toBe("session-123-abc");
    expect(valid.dwellTimeSeconds).toBe(45);
    expect(valid.categoryDwellMap["cat-burgers"]).toBe(30);
  });

  it("rejects negative dwell times", () => {
    expect(() =>
      recordStorefrontSessionSchema.parse({
        sessionKey: "session-123-abc",
        dwellTimeSeconds: -5,
      }),
    ).toThrow();
  });

  it("validates billing document issuance schema", () => {
    const valid = issueBillingDocumentSchema.parse({
      orderId: "a0000000-0000-4000-8000-000000000001",
      documentType: "factura_b",
      pointOfSale: 1,
      customerDocType: "DNI",
      customerDocNumber: "35123456",
      customerName: "Juan Perez",
    });

    expect(valid.documentType).toBe("factura_b");
    expect(valid.pointOfSale).toBe(1);
    expect(valid.customerDocType).toBe("DNI");
  });

  it("validates top products filter defaults", () => {
    const filter = topProductsFilterSchema.parse({});
    expect(filter.source).toBe("all");
    expect(filter.sortBy).toBe("quantity");
    expect(filter.limit).toBe(10);
  });

  it("validates analytics date filter defaults", () => {
    const filter = analyticsDateFilterSchema.parse({});
    expect(filter.granularity).toBe("day");
    expect(filter.source).toBe("all");
  });
});
