import { describe, expect, it } from "vitest";
import { analyticsDateFilterSchema } from "@/features/analytics/domain/analytics.schemas";
import { topProductsFilterSchema } from "@/features/billing/domain/billing.schemas";

describe("analytics dashboard domain & filter logic", () => {
  it("normalizes default granularity and channel", () => {
    const filter = analyticsDateFilterSchema.parse({});
    expect(filter.granularity).toBe("day");
    expect(filter.source).toBe("all");
  });

  it("supports hour granularity for single-day/live view", () => {
    const filter = analyticsDateFilterSchema.parse({
      granularity: "hour",
      source: "mercadopago_webhook",
    });
    expect(filter.granularity).toBe("hour");
    expect(filter.source).toBe("mercadopago_webhook");
  });

  it("validates revenue and quantity product ranking options", () => {
    const filterQty = topProductsFilterSchema.parse({ sortBy: "quantity", limit: 5 });
    const filterRev = topProductsFilterSchema.parse({ sortBy: "revenue", limit: 20 });

    expect(filterQty.sortBy).toBe("quantity");
    expect(filterQty.limit).toBe(5);
    expect(filterRev.sortBy).toBe("revenue");
    expect(filterRev.limit).toBe(20);
  });
});
