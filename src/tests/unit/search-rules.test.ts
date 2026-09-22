import { describe, expect, it } from "vitest";
import {
  assertValidItemTenant,
  buildStorefrontProductAnchor,
  InvalidItemTenantAssociationError,
  sanitizeSearchQuery,
  SEARCH_CONFIG,
} from "@/features/search/domain/search.rules";
import {
  searchQuerySchema,
  searchResponseEnvelopeSchema,
} from "@/features/search/domain/search.schemas";
import { SearchRateLimiter } from "@/features/search/infrastructure/search-rate-limiter";

describe("Cross-Tenant Search: Domain Rules & Rate Limiter", () => {
  describe("sanitizeSearchQuery", () => {
    it("returns empty string for non-string or whitespace-only inputs", () => {
      expect(sanitizeSearchQuery(null)).toBe("");
      expect(sanitizeSearchQuery(undefined)).toBe("");
      expect(sanitizeSearchQuery(123)).toBe("");
      expect(sanitizeSearchQuery("   ")).toBe("");
      expect(sanitizeSearchQuery("\t\n")).toBe("");
    });

    it("strips non-printable ASCII control characters", () => {
      const dirty = "milan\u0000esa\u0007 \u001Fcon papas";
      expect(sanitizeSearchQuery(dirty)).toBe("milanesa con papas");
    });

    it("trims and truncates queries exceeding MAX_QUERY_LENGTH", () => {
      const longQuery = "a".repeat(120);
      const sanitized = sanitizeSearchQuery(longQuery);
      expect(sanitized.length).toBe(SEARCH_CONFIG.MAX_QUERY_LENGTH);
      expect(sanitized).toBe("a".repeat(80));
    });
  });

  describe("buildStorefrontProductAnchor", () => {
    it("builds a relative query string with item anchor", () => {
      const itemId = "550e8400-e29b-41d4-a716-446655440000";
      expect(buildStorefrontProductAnchor(itemId)).toBe(
        `?item=550e8400-e29b-41d4-a716-446655440000`,
      );
    });

    it("throws an error when itemId is empty or whitespace", () => {
      expect(() => buildStorefrontProductAnchor("")).toThrow(
        "A valid itemId is required",
      );
      expect(() => buildStorefrontProductAnchor("   ")).toThrow(
        "A valid itemId is required",
      );
    });
  });

  describe("assertValidItemTenant", () => {
    it("passes when item belongs to the same tenant", () => {
      const tenantId = "11111111-1111-4000-8000-000000000001";
      const itemId = "22222222-2222-4000-8000-000000000002";
      expect(() =>
        assertValidItemTenant(itemId, tenantId, tenantId),
      ).not.toThrow();
    });

    it("throws InvalidItemTenantAssociationError when tenants mismatch", () => {
      const tenantA = "11111111-1111-4000-8000-000000000001";
      const tenantB = "99999999-9999-4000-8000-000000000009";
      const itemId = "22222222-2222-4000-8000-000000000002";
      expect(() =>
        assertValidItemTenant(itemId, tenantA, tenantB),
      ).toThrow(InvalidItemTenantAssociationError);
    });
  });

  describe("searchQuerySchema", () => {
    it("applies defaults for empty query and missing limits", () => {
      const parsed = searchQuerySchema.parse({});
      expect(parsed.q).toBe("");
      expect(parsed.productsLimit).toBe(10);
      expect(parsed.businessesLimit).toBe(10);
    });

    it("coerces string limits to numbers", () => {
      const parsed = searchQuerySchema.parse({
        q: "hamburguesa",
        productsLimit: "25",
        businessesLimit: "5",
      });
      expect(parsed.q).toBe("hamburguesa");
      expect(parsed.productsLimit).toBe(25);
      expect(parsed.businessesLimit).toBe(5);
    });

    it("rejects limits exceeding MAX_LIMIT (50)", () => {
      const result = searchQuerySchema.safeParse({
        q: "test",
        productsLimit: 51,
      });
      expect(result.success).toBe(false);
    });

    it("rejects queries exceeding 80 characters", () => {
      const result = searchQuerySchema.safeParse({
        q: "a".repeat(81),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("searchResponseEnvelopeSchema", () => {
    it("validates successful envelope with products and businesses", () => {
      const sample = {
        success: true,
        data: {
          query: "mila",
          products: [
            {
              itemId: "550e8400-e29b-41d4-a716-446655440000",
              name: "Milanesa Napolitana",
              price: "8500.00",
              currency: "ARS",
              category: "Platos",
              imageUrl: null,
              tenant: {
                id: "11111111-1111-4000-8000-000000000001",
                slug: "chiken-stop",
                name: "Chiken Stop",
              },
              storefrontPath: "?item=550e8400-e29b-41d4-a716-446655440000",
            },
          ],
          businesses: [
            {
              id: "11111111-1111-4000-8000-000000000001",
              name: "Chiken Stop",
              slug: "chiken-stop",
              currency: "ARS",
              locationName: "Centro",
              locationAddress: "Bunge 123",
              lat: -35.42,
              lng: -56.84,
              mapQuery: "-35.42,-56.84",
              categoriesCount: 4,
            },
          ],
        },
        error: null,
      };

      const result = searchResponseEnvelopeSchema.safeParse(sample);
      expect(result.success).toBe(true);
    });
  });

  describe("SearchRateLimiter", () => {
    it("allows up to 30 requests and blocks the 31st within 60 seconds", () => {
      const limiter = new SearchRateLimiter(30, 60_000);
      const ip = "192.168.1.50";
      const now = 1_000_000;

      for (let i = 1; i <= 30; i++) {
        const check = limiter.checkRateLimit(ip, now);
        expect(check.allowed).toBe(true);
        limiter.recordRequest(ip, now);
      }

      // 31st request
      const blocked = limiter.checkRateLimit(ip, now + 1000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBe(59);
    });

    it("resets block after the 60 second window elapses", () => {
      const limiter = new SearchRateLimiter(2, 60_000);
      const ip = "10.0.0.1";
      const start = 100_000;

      limiter.recordRequest(ip, start);
      limiter.recordRequest(ip, start);

      expect(limiter.checkRateLimit(ip, start).allowed).toBe(false);

      // Check after 61 seconds
      expect(limiter.checkRateLimit(ip, start + 61_000).allowed).toBe(true);
    });

    it("isolates different client IPs independently", () => {
      const limiter = new SearchRateLimiter(2, 60_000);
      const ipA = "1.1.1.1";
      const ipB = "2.2.2.2";
      const now = 500_000;

      limiter.recordRequest(ipA, now);
      limiter.recordRequest(ipA, now);
      expect(limiter.checkRateLimit(ipA, now).allowed).toBe(false);

      // IP B is unaffected
      expect(limiter.checkRateLimit(ipB, now).allowed).toBe(true);
    });
  });
});
