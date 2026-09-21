import { describe, expect, it } from "vitest";
import { createCartSchema } from "@/features/cart/domain/cart.rules";

describe("Story 2.3: Cart Reactive Revalidation", () => {
  describe("createCartSchema validation", () => {
    it("accepts valid lines with optional discountCode", () => {
      const validWithCode = {
        lines: [
          {
            kind: "item" as const,
            resourceId: "00000000-0000-4000-8000-000000000001",
            quantity: 2,
            optionIds: [],
          },
        ],
        discountCode: "PROMO20",
      };

      const parsed = createCartSchema.parse(validWithCode);
      expect(parsed.discountCode).toBe("PROMO20");
      expect(parsed.lines).toHaveLength(1);
    });

    it("accepts valid lines without discountCode", () => {
      const validNoCode = {
        lines: [
          {
            kind: "item" as const,
            resourceId: "00000000-0000-4000-8000-000000000001",
            quantity: 1,
            optionIds: [],
          },
        ],
      };

      const parsed = createCartSchema.parse(validNoCode);
      expect(parsed.discountCode).toBeUndefined();
    });
  });
});
