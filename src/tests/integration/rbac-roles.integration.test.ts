import { describe, expect, it, vi } from "vitest";
import {
  SessionService,
  TenantAccessDeniedError,
  type SessionRepository,
} from "@/features/identity/application/session.service";
import {
  resolveAdministrativeTenantContext,
  type TenantResolverStore,
} from "@/lib/tenant-context/resolvers";

describe("RBAC role type expansion", () => {
  it("stores and resolves owner role", async () => {
    const repository: SessionRepository = {
      findCredentialByEmail: vi.fn(),
      insertSession: vi.fn(),
      findSessionByDigest: vi.fn(async () => ({
        sessionId: "session-id",
        userId: "user-owner",
        email: "owner@test.com",
        userStatus: "active" as const,
        expiresAt: new Date("2099-01-01"),
        revokedAt: null,
      })),
      touchSession: vi.fn(),
      revokeSession: vi.fn(),
      findLiveMembership: vi.fn(async () => ({
        id: "membership-owner",
        tenantId: "tenant-id",
        role: "owner" as const,
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
    expect(membership.role).toBe("owner");
  });

  it("stores and resolves admin role", async () => {
    const repository: SessionRepository = {
      findCredentialByEmail: vi.fn(),
      insertSession: vi.fn(),
      findSessionByDigest: vi.fn(async () => ({
        sessionId: "session-id",
        userId: "user-admin",
        email: "admin@test.com",
        userStatus: "active" as const,
        expiresAt: new Date("2099-01-01"),
        revokedAt: null,
      })),
      touchSession: vi.fn(),
      revokeSession: vi.fn(),
      findLiveMembership: vi.fn(async () => ({
        id: "membership-admin",
        tenantId: "tenant-id",
        role: "admin" as const,
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
    expect(membership.role).toBe("admin");
  });

  it("stores and resolves employee role", async () => {
    const repository: SessionRepository = {
      findCredentialByEmail: vi.fn(),
      insertSession: vi.fn(),
      findSessionByDigest: vi.fn(async () => ({
        sessionId: "session-id",
        userId: "user-employee",
        email: "employee@test.com",
        userStatus: "active" as const,
        expiresAt: new Date("2099-01-01"),
        revokedAt: null,
      })),
      touchSession: vi.fn(),
      revokeSession: vi.fn(),
      findLiveMembership: vi.fn(async () => ({
        id: "membership-employee",
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
    expect(membership.role).toBe("employee");
  });

  it("resolves TenantContext with correct role for each actor", async () => {
    const store: TenantResolverStore = {
      resolvePublicSlug: vi.fn(),
      resolveAdministrativeAuthority: vi.fn(async ({ tenantId }) =>
        tenantId === "tenant-id"
          ? {
              tenantId,
              status: "active" as const,
              userId: "user-id",
              membershipId: "membership-id",
              role: "admin" as const,
            }
          : null,
      ),
      resolveWebhookRoute: vi.fn(),
      resolvePrintAgent: vi.fn(),
      resolvePersistedWork: vi.fn(),
      authorizeMaintenance: vi.fn(),
    };

    const context = await resolveAdministrativeTenantContext(store, {
      sessionToken: "token",
      tenantId: "tenant-id",
      correlationId: "correlation-id",
    });

    expect(context.actor).toEqual({
      kind: "user",
      userId: "user-id",
      membershipId: "membership-id",
      role: "admin",
    });
  });

  it("denies access for revoked membership regardless of role", async () => {
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
        role: "admin" as const,
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
});
