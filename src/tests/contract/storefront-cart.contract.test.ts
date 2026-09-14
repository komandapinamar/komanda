import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("storefront and cart producer contract", () => {
  it("has implemented route adapters for storefront and cart operations", async () => {
    const [catalogRoute, cartsRoute, cartDetailRoute, paymentSessionsRoute] =
      await Promise.all([
        readFile("app/api/v1/storefronts/[tenantSlug]/catalog/route.ts", "utf8"),
        readFile("app/api/v1/storefronts/[tenantSlug]/carts/route.ts", "utf8"),
        readFile("app/api/v1/storefronts/[tenantSlug]/carts/[cartId]/route.ts", "utf8"),
        readFile("app/api/v1/storefronts/[tenantSlug]/carts/[cartId]/payment-sessions/route.ts", "utf8"),
      ]);

    expect(catalogRoute).toContain("GET");
    expect(cartsRoute).toContain("POST");
    expect(cartDetailRoute).toContain("GET");
    expect(paymentSessionsRoute).toContain("POST");
  });
});
