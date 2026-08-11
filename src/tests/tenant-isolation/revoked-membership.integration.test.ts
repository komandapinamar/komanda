import { describe, expect, it, vi } from "vitest";
import {
  SessionService,
  TenantAccessDeniedError,
  type SessionRepository,
} from "@/features/identity/application/session.service";

describe("Revoked membership isolation", () => {
  it("denies access immediately after revocation", async () => {
    const repository: SessionRepository = {
      findCredentialByEmail: vi.fn(),
      insertSession: vi.fn(),
      findSessionByDigest: vi.fn(async () => ({
        sessionId: "session-id",
        userId: "user-revoked",
        email: "revoked@test.com",
        userStatus: "active" as const,
        expiresAt: new Date("2099-01-01"),
        revokedAt: null,
      })),
      touchSession: vi.fn(),
      revokeSession: vi.fn(),
      findLiveMembership: vi.fn(async () => ({
        id: "membership-revoked",
        tenantId: "tenant-id",
        role: "employee" as const,
        status: "revoked" as const,
        tenantStatus: "active" as const,
        tenantName: "Test Tenant",
        tenantSlug: "test-tenant",
      })),
      listLiveMemberships: vi.fn(async () => []),
    };
    const service = new SessionService(
      repository,
      vi.fn(async () => true),
      () => new Date(),
    );

    await expect(
      service.authorizeTenant("valid-token", "tenant-id"),
    ).rejects.toBeInstanceOf(TenantAccessDeniedError);
  });

  it("allows access with active membership through same flow", async () => {
    const repository: SessionRepository = {
      findCredentialByEmail: vi.fn(),
      insertSession: vi.fn(),
      findSessionByDigest: vi.fn(async () => ({
        sessionId: "session-id",
        userId: "user-active",
        email: "active@test.com",
        userStatus: "active" as const,
        expiresAt: new Date("2099-01-01"),
        revokedAt: null,
      })),
      touchSession: vi.fn(),
      revokeSession: vi.fn(),
      findLiveMembership: vi.fn(async () => ({
        id: "membership-active",
        tenantId: "tenant-id",
        role: "employee" as const,
        status: "active" as const,
        tenantStatus: "active" as const,
        tenantName: "Test Tenant",
        tenantSlug: "test-tenant",
      })),
      listLiveMemberships: vi.fn(async () => []),
    };
    const service = new SessionService(
      repository,
      vi.fn(async () => true),
      () => new Date(),
    );

    const { membership } = await service.authorizeTenant("valid-token", "tenant-id");
    expect(membership.status).toBe("active");
  });
});
