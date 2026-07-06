import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  provisionTenantRequestSchema,
  provisionTenantResponseSchema,
} from "@/features/provisioning/domain/provisioning.schemas";
import { mockProvisioningRequest } from "@/tests/fixtures/mock-provisioning";

describe("komanda-business provisioning contract", () => {
  it("keeps the real consumer and temporary mock on one strict request schema", () => {
    expect(provisionTenantRequestSchema.parse(mockProvisioningRequest)).toEqual(
      mockProvisioningRequest,
    );
    expect(() =>
      provisionTenantRequestSchema.parse({
        ...mockProvisioningRequest,
        entitlements: { printing: true },
      }),
    ).toThrow();
  });

  it("returns onboarding without activating sales and supports existing verified users", () => {
    const base = {
      tenant: {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Komanda Mock",
        slug: "tenant-mock",
        status: "onboarding",
        role: "owner",
      },
      membership: { role: "owner" },
      primaryLocation: {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Principal",
        timezone: "America/Argentina/Buenos_Aires",
        status: "active",
      },
      entitlementSnapshot: {
        planId: "development",
        planVersion: 1,
        entitlements: {
          catalogManagement: true,
          onlinePayments: true,
          printing: true,
        },
        effectiveAt: "2026-07-05T12:00:00.000Z",
      },
      readiness: { ready: false, checks: [] },
      onboardingHandoff: {
        token: "x".repeat(32),
        expiresAt: "2026-07-05T12:10:00.000Z",
      },
    };
    expect(
      provisionTenantResponseSchema.parse({
        ...base,
        ownerVerification: {
          status: "pending_verification",
          expiresAt: "2026-07-05T12:30:00.000Z",
        },
      }).tenant.status,
    ).toBe("onboarding");
    expect(() =>
      provisionTenantResponseSchema.parse({
        ...base,
        ownerVerification: { status: "verified", expiresAt: null },
        salesEnabled: true,
      }),
    ).toThrow();
  });

  it("publishes the versioned provisioning, verification, session, tenant and readiness paths", async () => {
    const document = parse(
      await readFile(
        resolve(
          process.cwd(),
          "../specs/001-multi-tenant-base/contracts/openapi.yaml",
        ),
        "utf8",
      ),
    ) as { paths: Record<string, unknown> };
    for (const path of [
      "/api/v1/provisioning/tenants",
      "/api/v1/auth/email-verifications/confirm",
      "/api/v1/auth/sessions",
      "/api/v1/auth/sessions/current",
      "/api/v1/tenants",
      "/api/v1/tenants/{tenantId}/readiness",
    ]) {
      expect(document.paths[path]).toBeDefined();
    }
  });
});
