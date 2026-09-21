import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  CreateDiscountSchema,
  calculateDiscountStatus,
  formatDiscountOutput,
} from "@/features/discounts/domain/discount.schemas";
import {
  DiscountConflictError,
  DiscountNotFoundError,
  DiscountService,
} from "@/features/discounts/application/discount.service";
import {
  discountErrorResponse,
  versionFromRequest,
} from "@/features/discounts/web/discount-http";
import { TenantAccessDeniedError } from "@/features/identity/application/session.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import type { DiscountRow } from "@/features/discounts/infrastructure/discount.repository";

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn((_ctx, callback) => callback({})),
}));

describe("Story 1.2: Discounts Admin Routes & Service", () => {
  const tenantId = "00000000-0000-4000-8000-000000000001";
  const mockContext = {
    tenantId,
    locationId: "00000000-0000-4000-8000-000000000002",
    correlationId: "corr-123",
    source: "admin",
    actor: {
      kind: "user",
      userId: "user-1",
      email: "owner@komanda.test",
      role: "owner",
      sessionId: "sess-1",
    },
  } as unknown as TenantContext;

  describe("Validation Schema (CreateDiscountSchema)", () => {
    it("accepts valid percentage discount input", () => {
      const valid = {
        code: "VERANO15",
        name: "Promo Verano",
        discountType: "percentage",
        discountValue: "15.00",
        minOrderAmount: "5000.00",
        maxRedemptions: 50,
        scope: "global",
      };

      const parsed = CreateDiscountSchema.parse(valid);
      expect(parsed.code).toBe("VERANO15");
      expect(parsed.discountValue).toBe("15.00");
    });

    it("rejects percentage discount greater than 100", () => {
      const invalid = {
        code: "OVER100",
        name: "Super Promo",
        discountType: "percentage",
        discountValue: "150.00",
      };

      expect(() => CreateDiscountSchema.parse(invalid)).toThrow(ZodError);
    });

    it("rejects inverted dates where endsAt is before startsAt", () => {
      const invalid = {
        code: "INVERTED",
        name: "Inverted",
        discountType: "fixed_amount",
        discountValue: "500.00",
        startsAt: new Date("2026-10-10"),
        endsAt: new Date("2026-10-01"),
      };

      expect(() => CreateDiscountSchema.parse(invalid)).toThrow(ZodError);
    });

    it("rejects category scope without categories", () => {
      const invalid = {
        code: "NOCATS",
        name: "No categories",
        discountType: "percentage",
        discountValue: "10.00",
        scope: "category",
        targetCategoryIds: [],
      };

      expect(() => CreateDiscountSchema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe("Status Calculator (calculateDiscountStatus)", () => {
    const now = new Date("2026-09-20T12:00:00Z");

    it("returns 'paused' when isActive is false", () => {
      const status = calculateDiscountStatus(
        {
          isActive: false,
          startsAt: new Date("2026-09-01"),
          endsAt: null,
          maxRedemptions: null,
          redemptionsCount: 0,
          deletedAt: null,
        },
        now,
      );
      expect(status).toBe("paused");
    });

    it("returns 'scheduled' when startsAt is in the future", () => {
      const status = calculateDiscountStatus(
        {
          isActive: true,
          startsAt: new Date("2026-10-01"),
          endsAt: null,
          maxRedemptions: null,
          redemptionsCount: 0,
          deletedAt: null,
        },
        now,
      );
      expect(status).toBe("scheduled");
    });

    it("returns 'expired' when endsAt is in the past", () => {
      const status = calculateDiscountStatus(
        {
          isActive: true,
          startsAt: new Date("2026-09-01"),
          endsAt: new Date("2026-09-10"),
          maxRedemptions: null,
          redemptionsCount: 0,
          deletedAt: null,
        },
        now,
      );
      expect(status).toBe("expired");
    });

    it("returns 'exhausted' when redemptions reach maxRedemptions", () => {
      const status = calculateDiscountStatus(
        {
          isActive: true,
          startsAt: new Date("2026-09-01"),
          endsAt: null,
          maxRedemptions: 10,
          redemptionsCount: 10,
          deletedAt: null,
        },
        now,
      );
      expect(status).toBe("exhausted");
    });

    it("returns 'active' when valid and within bounds", () => {
      const status = calculateDiscountStatus(
        {
          isActive: true,
          startsAt: new Date("2026-09-01"),
          endsAt: new Date("2026-09-30"),
          maxRedemptions: 100,
          redemptionsCount: 20,
          deletedAt: null,
        },
        now,
      );
      expect(status).toBe("active");
    });
  });

  describe("Discount HTTP Error Mapping & Headers", () => {
    it("maps DiscountConflictError to HTTP 409", async () => {
      const response = discountErrorResponse(
        new DiscountConflictError("Code already exists"),
        "corr-1",
      );
      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe("DISCOUNT_CONFLICT");
    });

    it("maps ZodError to HTTP 422", async () => {
      const error = new ZodError([
        {
          code: "custom",
          message: "Invalid field",
          path: ["code"],
        },
      ]);
      const response = discountErrorResponse(error, "corr-1");
      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("maps DiscountNotFoundError and TenantAccessDeniedError to HTTP 404 (non-disclosing)", async () => {
      const notFoundResp = discountErrorResponse(
        new DiscountNotFoundError("Not found"),
        "corr-1",
      );
      expect(notFoundResp.status).toBe(404);

      const accessResp = discountErrorResponse(
        new TenantAccessDeniedError("Access denied"),
        "corr-1",
      );
      expect(accessResp.status).toBe(404);
    });

    it("parses valid If-Match version header", () => {
      const req = new Request("http://localhost", {
        headers: { "if-match": "3" },
      });
      expect(versionFromRequest(req)).toBe(3);
    });

    it("returns undefined when If-Match header is absent", () => {
      const req = new Request("http://localhost");
      expect(versionFromRequest(req)).toBeUndefined();
    });

    it("throws 422 error when If-Match is non-numeric or invalid", () => {
      const req = new Request("http://localhost", {
        headers: { "if-match": "abc" },
      });
      expect(() => versionFromRequest(req)).toThrow("If-Match must be a positive integer.");
    });
  });
});
