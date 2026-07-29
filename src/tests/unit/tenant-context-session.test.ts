import { describe, expect, it, vi } from "vitest";
import {
  SessionService,
  TenantAccessDeniedError,
  digestSessionToken,
  type SessionRepository,
} from "@/features/identity/application/session.service";
import {
  resolveAdministrativeTenantContext,
  resolvePublicTenantContext,
  TenantResolutionError,
  type TenantResolverStore,
} from "@/lib/tenant-context/resolvers";

function resolverStore(): TenantResolverStore {
  return {
    resolvePublicSlug: vi.fn(async (slug) =>
      slug === "tenant-a"
        ? { tenantId: "tenant-a-id", status: "active" as const }
        : null,
    ),
    resolveAdministrativeAuthority: vi.fn(async ({ tenantId }) =>
      tenantId === "tenant-a-id"
        ? {
            tenantId,
            status: "active" as const,
            userId: "user-a",
            membershipId: "membership-a",
            role: "owner" as const,
          }
        : null,
    ),
    resolveWebhookRoute: vi.fn(),
    resolvePrintAgent: vi.fn(),
    resolvePersistedWork: vi.fn(),
    authorizeMaintenance: vi.fn(),
  };
}

describe("trusted tenant context resolvers", () => {
  it("does not accept a tenant id without live administrative authority", async () => {
    const store = resolverStore();
    await expect(
      resolveAdministrativeTenantContext(store, {
        sessionToken: "opaque-session",
        tenantId: "tenant-b-id",
        correlationId: "correlation-id",
      }),
    ).rejects.toBeInstanceOf(TenantResolutionError);
  });

  it("resolves only active public tenants", async () => {
    const context = await resolvePublicTenantContext(resolverStore(), {
      normalizedSlug: "tenant-a",
      correlationId: "correlation-id",
    });
    expect(context.tenantId).toBe("tenant-a-id");
    expect(context.actor).toEqual({
      kind: "anonymous",
      tenantSlug: "tenant-a",
    });
  });
});

describe("revocable session service", () => {
  it("persists only a digest and rechecks the live membership", async () => {
    let insertedDigest = "";
    const repository: SessionRepository = {
      findCredentialByEmail: vi.fn(async () => ({
        userId: "user-a",
        email: "owner.a@example.test",
        passwordHash: "hash",
        status: "active" as const,
      })),
      insertSession: vi.fn(async (input) => {
        insertedDigest = input.tokenDigest;
        return { id: "session-a" };
      }),
      findSessionByDigest: vi.fn(async (digest) => ({
        sessionId: "session-a",
        userId: "user-a",
        email: "owner.a@example.test",
        userStatus: "active" as const,
        expiresAt: new Date("2026-07-05T20:00:00.000Z"),
        revokedAt: null,
        tokenDigest: digest,
      })),
      touchSession: vi.fn(),
      revokeSession: vi.fn(),
      findLiveMembership: vi.fn(async () => ({
        id: "membership-a",
        tenantId: "tenant-a",
        role: "owner" as const,
        status: "active" as const,
        tenantStatus: "active" as const,
        tenantName: "Tenant A",
        tenantSlug: "tenant-a",
      })),
      listLiveMemberships: vi.fn(async () => []),
    };
    const service = new SessionService(
      repository,
      async () => true,
      () => new Date("2026-07-05T12:00:00.000Z"),
    );
    const created = await service.create({
      email: "OWNER.A@example.test",
      password: "correct-password",
    });

    expect(insertedDigest).toBe(digestSessionToken(created.token));
    expect(insertedDigest).not.toContain(created.token);
    await expect(
      service.authorizeTenant(created.token, "tenant-a"),
    ).resolves.toEqual(
      expect.objectContaining({
        membership: expect.objectContaining({ tenantId: "tenant-a" }),
      }),
    );
  });

  it("denies a revoked membership even with a valid session", async () => {
    const repository = {
      findSessionByDigest: vi.fn(async () => ({
        sessionId: "session-a",
        userId: "user-a",
        email: "owner.a@example.test",
        userStatus: "active" as const,
        expiresAt: new Date("2026-07-05T20:00:00.000Z"),
        revokedAt: null,
      })),
      touchSession: vi.fn(),
      findLiveMembership: vi.fn(async () => null),
    } as unknown as SessionRepository;
    const service = new SessionService(
      repository,
      async () => true,
      () => new Date("2026-07-05T12:00:00.000Z"),
    );
    await expect(
      service.authorizeTenant("valid-token", "tenant-a"),
    ).rejects.toBeInstanceOf(TenantAccessDeniedError);
  });
});
