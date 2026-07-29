import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

describe("storefront and cart producer contract", () => {
  it("publishes public catalog and tenant-bound cart operations", async () => {
    const document = parse(
      await readFile(
        resolve(process.cwd(), "../specs/001-multi-tenant-base/contracts/openapi.yaml"),
        "utf8",
      ),
    ) as { paths: Record<string, Record<string, unknown>> };
    expect(document.paths["/api/v1/storefronts/{tenantSlug}/catalog"]?.get).toBeDefined();
    expect(document.paths["/api/v1/storefronts/{tenantSlug}/carts"]?.post).toBeDefined();
    expect(document.paths["/api/v1/storefronts/{tenantSlug}/carts/{cartId}"]?.get).toBeDefined();
    expect(
      document.paths[
        "/api/v1/storefronts/{tenantSlug}/carts/{cartId}/payment-sessions"
      ]?.post,
    ).toBeDefined();
  });
});
