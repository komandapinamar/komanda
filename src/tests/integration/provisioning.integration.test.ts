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
      readFile("scripts/seed-mock-tenant.ts", "utf8"),
    );
    expect(source).toContain('process.env.NODE_ENV === "production"');
    expect(source).toContain("Mock tenant bootstrap is prohibited");
  });
});
