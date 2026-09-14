import { describe, expect, it, vi } from "vitest";
import {
  resolveAdministrativeTenantContext,
  TenantResolutionError,
  type TenantResolverStore,
} from "@/lib/tenant-context/resolvers";

describe("tenant administration authority", () => {
  it("constructs a new verified context for each live tenant selection", async () => {
    const store = {
      resolveAdministrativeAuthority: vi.fn(async ({ tenantId }) => ({
        tenantId,
        status: "active" as const,
        userId: "shared-owner",
        membershipId: `membership-${tenantId}`,
        role: "owner" as const,
      })),
    } as unknown as TenantResolverStore;
    const contextA = await resolveAdministrativeTenantContext(store, {
      sessionToken: "valid-session",
      tenantId: "tenant-a",
      correlationId: "correlation-a",
    });
    const contextB = await resolveAdministrativeTenantContext(store, {
      sessionToken: "valid-session",
      tenantId: "tenant-b",
      correlationId: "correlation-b",
    });
    expect(contextA.tenantId).toBe("tenant-a");
    expect(contextB.tenantId).toBe("tenant-b");
    expect(contextA).not.toEqual(contextB);
  });

  it("denies known foreign ids and revoked memberships without disclosure", async () => {
    const store = {
      resolveAdministrativeAuthority: vi.fn(async () => null),
    } as unknown as TenantResolverStore;
    for (const tenantId of ["known-foreign-tenant", "revoked-membership-tenant"]) {
      await expect(
        resolveAdministrativeTenantContext(store, {
          sessionToken: "valid-session",
          tenantId,
          correlationId: "correlation-id",
        }),
      ).rejects.toBeInstanceOf(TenantResolutionError);
    }
  });
});
