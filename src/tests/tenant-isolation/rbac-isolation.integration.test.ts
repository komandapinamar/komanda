import { describe, expect, it, vi } from "vitest";
import {
  SessionService,
  TenantAccessDeniedError,
  type SessionRepository,
} from "@/features/identity/application/session.service";

function sessionRepository(role: "owner" | "admin" | "employee"): SessionRepository {
  return {
    findCredentialByEmail: vi.fn(),
    insertSession: vi.fn(),
    findSessionByDigest: vi.fn(async () => ({
      sessionId: "session-id",
      userId: `user-${role}`,
      email: `${role}@test.com`,
      userStatus: "active" as const,
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    })),
    touchSession: vi.fn(),
    revokeSession: vi.fn(),
    findLiveMembership: vi.fn(async () => ({
      id: `membership-${role}`,
      tenantId: "tenant-id",
      role: role as "owner" | "admin" | "employee",
      status: "active" as const,
      tenantStatus: "active" as const,
      tenantName: "Test Tenant",
      tenantSlug: "test-tenant",
    })),
    listLiveMemberships: vi.fn(async () => []),
  };
}

describe("RBAC role isolation", () => {
  it("owner can access tenant", async () => {
    const service = new SessionService(
      sessionRepository("owner"),
      vi.fn(async () => true),
      () => new Date(),
    );
    const { membership } = await service.authorizeTenant("token", "tenant-id");
    expect(membership.role).toBe("owner");
  });

  it("admin can access tenant", async () => {
    const service = new SessionService(
      sessionRepository("admin"),
      vi.fn(async () => true),
      () => new Date(),
    );
    const { membership } = await service.authorizeTenant("token", "tenant-id");
    expect(membership.role).toBe("admin");
  });

  it("employee can access tenant", async () => {
    const service = new SessionService(
      sessionRepository("employee"),
      vi.fn(async () => true),
      () => new Date(),
    );
    const { membership } = await service.authorizeTenant("token", "tenant-id");
    expect(membership.role).toBe("employee");
  });

  it("revoked membership is denied regardless of role", async () => {
    const repository: SessionRepository = {
      ...sessionRepository("admin"),
      findLiveMembership: vi.fn(async () => ({
        id: "membership-revoked",
        tenantId: "tenant-id",
        role: "admin" as const,
        status: "revoked" as const,
        tenantStatus: "active" as const,
        tenantName: "Test Tenant",
        tenantSlug: "test-tenant",
      })),
    };
    const service = new SessionService(
      repository,
      vi.fn(async () => true),
      () => new Date(),
    );
    await expect(
      service.authorizeTenant("token", "tenant-id"),
    ).rejects.toBeInstanceOf(TenantAccessDeniedError);
  });

  it("suspended tenant denies access regardless of role", async () => {
    const repository: SessionRepository = {
      ...sessionRepository("owner"),
      findLiveMembership: vi.fn(async () => ({
        id: "membership-owner",
        tenantId: "tenant-id",
        role: "owner" as const,
        status: "active" as const,
        tenantStatus: "suspended" as const,
        tenantName: "Test Tenant",
        tenantSlug: "test-tenant",
      })),
    };
    const service = new SessionService(
      repository,
      vi.fn(async () => true),
      () => new Date(),
    );
    await expect(
      service.authorizeTenant("token", "tenant-id"),
    ).rejects.toBeInstanceOf(TenantAccessDeniedError);
  });
});
