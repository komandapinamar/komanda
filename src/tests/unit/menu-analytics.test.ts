import { describe, expect, it } from "vitest";
import { recordStorefrontSessionSchema } from "@/features/analytics/domain/analytics.schemas";

describe("storefront menu analytics tracking", () => {
  it("parses valid telemetry payload with category dwell mapping", () => {
    const payload = {
      sessionKey: "s_1783300000_abc123",
      deviceType: "mobile",
      dwellTimeSeconds: 42,
      categoryDwellMap: {
        "cat-burgers-uuid": 25,
        "cat-drinks-uuid": 17,
      },
      itemViewsMap: {
        "item-classic-burger": 3,
      },
      cartCreated: false,
      orderPlaced: false,
    };

    const parsed = recordStorefrontSessionSchema.parse(payload);
    expect(parsed.sessionKey).toBe("s_1783300000_abc123");
    expect(parsed.dwellTimeSeconds).toBe(42);
    expect(parsed.deviceType).toBe("mobile");
    expect(parsed.categoryDwellMap["cat-burgers-uuid"]).toBe(25);
  });

  it("handles empty maps with default fallback", () => {
    const parsed = recordStorefrontSessionSchema.parse({
      sessionKey: "s_simple_test",
      dwellTimeSeconds: 10,
    });

    expect(parsed.deviceType).toBe("unknown");
    expect(parsed.categoryDwellMap).toEqual({});
    expect(parsed.cartCreated).toBe(false);
  });
});
