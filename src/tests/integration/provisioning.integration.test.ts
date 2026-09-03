import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ProvisionTenantService } from "@/features/provisioning/application/provision-tenant.service";
import type { ProvisioningPersistence } from "@/features/provisioning/application/provision-tenant.service";
import type { ProvisionedAggregate } from "@/features/provisioning/infrastructure/provisioning.repository";
import { CaptureVerificationDelivery } from "@/features/identity/infrastructure/verification-delivery.port";
import { mockProvisioningRequest } from "@/tests/fixtures/mock-provisioning";

const now = new Date("2026-07-05T12:00:00.000Z");
const plan = {
  planId: "development",
  version: 1,
  entitlements: {
    catalog_management: true,
    online_payments: true,
    printing: true,
  },
};

function aggregate(
  input: Parameters<ProvisioningPersistence["provision"]>[0],
): ProvisionedAggregate {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    tenantName: input.request.tenant.name,
    tenantSlug: input.request.tenant.slug,
    userId: "00000000-0000-4000-8000-000000000002",
    ownerEmail: input.request.owner.email,
    ownerVerified: false,
    locationId: "00000000-0000-4000-8000-000000000003",
    locationName: input.request.primaryLocation.name,
    timezone: input.request.tenant.timezone,
    plan,
    effectiveAt: now,
    verificationExpiresAt: input.verificationExpiresAt,
    handoffExpiresAt: input.handoffExpiresAt,
  };
}

describe("provision tenant orchestration", () => {
  it("validates the plan, hashes credentials, persists once and delivers Core's challenge", async () => {
    const delivery = new CaptureVerificationDelivery();
    const repository: ProvisioningPersistence = {
      findActivePlan: vi.fn(async () => plan),
      provision: vi.fn(async (input) => aggregate(input)),
    };
    const service = new ProvisionTenantService(repository, delivery, () => now);

    const response = await service.execute({
      request: mockProvisioningRequest,
      idempotencyKey: "request-0000000000000000000000001",
      serviceId: "komanda-business",
      correlationId: "00000000-0000-4000-8000-000000000099",
    });

    expect(response.readiness.ready).toBe(false);
    expect(response.tenant.status).toBe("onboarding");
    expect(delivery.messages).toHaveLength(1);
    const persisted = vi.mocked(repository.provision).mock.calls[0][0];
    expect(persisted.passwordHash).not.toContain(
      mockProvisioningRequest.owner.password,
    );
    expect(persisted.verificationTokenDigest).toHaveLength(64);
  });

  it("does not persist anything for an unknown plan", async () => {
    const repository: ProvisioningPersistence = {
      findActivePlan: vi.fn(async () => null),
      provision: vi.fn(),
    };
    const service = new ProvisionTenantService(
      repository,
      new CaptureVerificationDelivery(),
      () => now,
    );
    await expect(
      service.execute({
        request: mockProvisioningRequest,
        idempotencyKey: "request-0000000000000000000000002",
        serviceId: "komanda-business",
      }),
    ).rejects.toThrow("unavailable");
    expect(repository.provision).not.toHaveBeenCalled();
  });

  it("keeps production mock bootstrap hard-disabled", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile("scripts/seed-dev-tenant.ts", "utf8"),
    );
    expect(source).toContain('process.env.NODE_ENV === "production"');
    expect(source).toContain("Dev tenant bootstrap is prohibited in production.");
  });
});

const databaseTest = process.env.DATABASE_TEST_INTEGRATION === "1" ? it : it.skip;

describe("provision tenant database guarantees", () => {
  databaseTest(
    "rolls back failed claims, replays idempotently, links users and consumes verification once",
    async () => {
      const directUrl = process.env.DATABASE_DIRECT_URL;
      if (!directUrl) throw new Error("DATABASE_DIRECT_URL is required.");
      const owner = new Pool({ connectionString: directUrl, max: 1 });
      const tenantIds: string[] = [];
      const suffix = randomUUID();

      const { DatabaseProvisioningRepository } = await import(
        "@/features/provisioning/infrastructure/provisioning.repository"
      );
      const {
        IdentityVerificationService,
        InvalidOnboardingHandoffError,
        InvalidVerificationChallengeError,
        OnboardingHandoffService,
      } = await import(
        "@/features/identity/application/identity-verification.service"
      );

      try {
        const repository = new DatabaseProvisioningRepository();
        const delivery = new CaptureVerificationDelivery();
        const service = new ProvisionTenantService(repository, delivery);
        const email = `owner.${suffix}@example.test`;
        const slug = `rollback-${suffix}`;
        const idempotencyKey = `rollback-${suffix}`;

        const blockingTenantId = randomUUID();
        await owner.query(
          `insert into tenants (id, name, slug, normalized_slug)
           values ($1, 'Blocking tenant', $2, $2)`,
          [blockingTenantId, slug],
        );
        await expect(
          service.execute({
            request: {
              ...mockProvisioningRequest,
              owner: { ...mockProvisioningRequest.owner, email },
              tenant: { ...mockProvisioningRequest.tenant, slug },
            },
            idempotencyKey,
            serviceId: "integration-test",
          }),
        ).rejects.toThrow("slug");
        expect(delivery.messages).toHaveLength(0);
        await owner.query("delete from tenants where id = $1", [blockingTenantId]);

        const request = {
          ...mockProvisioningRequest,
          owner: { ...mockProvisioningRequest.owner, email },
          tenant: { ...mockProvisioningRequest.tenant, slug },
        };
        const first = await service.execute({
          request,
          idempotencyKey,
          serviceId: "integration-test",
        });
        tenantIds.push(first.tenant.id);
        expect(delivery.messages).toHaveLength(1);

        const replay = await service.execute({
          request,
          idempotencyKey,
          serviceId: "integration-test",
        });
        expect(replay.tenant.id).toBe(first.tenant.id);
        const aggregateCount = await owner.query<{ count: number }>(
          "select count(*)::int as count from tenants where id = $1",
          [first.tenant.id],
        );
        expect(aggregateCount.rows[0]?.count).toBe(1);

        const verificationToken = delivery.messages.at(-1)!.token;
        const verification = new IdentityVerificationService();
        await verification.confirm(verificationToken, randomUUID());
        await expect(
          verification.confirm(verificationToken, randomUUID()),
        ).rejects.toBeInstanceOf(InvalidVerificationChallengeError);

        const handoff = new OnboardingHandoffService();
        const onboardingSession = await handoff.consume({
          tenantId: first.tenant.id,
          token: replay.onboardingHandoff.token,
          metadata: { source: "integration-test" },
        });
        expect(onboardingSession.token).toHaveLength(43);
        await expect(
          handoff.consume({
            tenantId: first.tenant.id,
            token: replay.onboardingHandoff.token,
          }),
        ).rejects.toBeInstanceOf(InvalidOnboardingHandoffError);

        const secondIdempotencyKey = `existing-user-${suffix}`;
        const linked = await service.execute({
          request: {
            ...request,
            tenant: { ...request.tenant, slug: `linked-${suffix}` },
          },
          idempotencyKey: secondIdempotencyKey,
          serviceId: "integration-test",
        });
        tenantIds.push(linked.tenant.id);
        expect(linked.ownerVerification.status).toBe("verified");

        const linkedUsers = await owner.query<{ users: number }>(
          `select count(distinct tm.user_id)::int as users
           from tenant_memberships tm
           where tm.tenant_id = any($1::uuid[])`,
          [tenantIds],
        );
        expect(linkedUsers.rows[0]?.users).toBe(1);
      } finally {
        // Provisioning emits append-only audit evidence that intentionally
        // prevents deleting the tenant. IDs are unique and the CI database is
        // ephemeral; development runs retain only synthetic fixtures.
        await owner.end();
      }
    },
    60_000,
  );

  databaseTest(
    "allows only one winner for concurrent normalized slugs",
    async () => {
      const directUrl = process.env.DATABASE_DIRECT_URL;
      if (!directUrl) throw new Error("DATABASE_DIRECT_URL is required.");
      const owner = new Pool({ connectionString: directUrl, max: 1 });
      const tenantIds: string[] = [];
      const suffix = randomUUID();
      const idempotencyKeys = [`concurrent-a-${suffix}`, `concurrent-b-${suffix}`];
      const emails = [
        `concurrent.a.${suffix}@example.test`,
        `concurrent.b.${suffix}@example.test`,
      ];
      const { DatabaseProvisioningRepository } = await import(
        "@/features/provisioning/infrastructure/provisioning.repository"
      );
      try {
        const service = new ProvisionTenantService(
          new DatabaseProvisioningRepository(),
          new CaptureVerificationDelivery(),
        );
        const attempts = await Promise.allSettled(
          emails.map((email, index) =>
            service.execute({
              request: {
                ...mockProvisioningRequest,
                owner: { ...mockProvisioningRequest.owner, email },
                tenant: {
                  ...mockProvisioningRequest.tenant,
                  slug:
                    index === 0
                      ? `Concurrent ${suffix}`
                      : `concurrent-${suffix}`,
                },
              },
              idempotencyKey: idempotencyKeys[index]!,
              serviceId: "integration-test",
            }),
          ),
        );
        const fulfilled = attempts.filter(
          (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.execute>>> =>
            result.status === "fulfilled",
        );
        expect(fulfilled).toHaveLength(1);
        expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
        tenantIds.push(fulfilled[0]!.value.tenant.id);
      } finally {
        await owner.end();
      }
    },
    60_000,
  );
});
