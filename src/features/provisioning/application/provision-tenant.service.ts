import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import {
  normalizeTenantSlug,
  provisionTenantRequestSchema,
  provisionTenantResponseSchema,
  type ProvisionTenantRequest,
  type ProvisionTenantResponse,
} from "@/features/provisioning/domain/provisioning.schemas";
import type {
  DatabaseProvisioningRepository,
  ProvisionedAggregate,
  ResolvedPlan,
} from "@/features/provisioning/infrastructure/provisioning.repository";
import type { VerificationDelivery } from "@/features/identity/infrastructure/verification-delivery.port";

export interface ProvisioningPersistence {
  findActivePlan(planId: string, now: Date): Promise<ResolvedPlan | null>;
  provision(
    input: Parameters<DatabaseProvisioningRepository["provision"]>[0],
  ): Promise<ProvisionedAggregate>;
}

export class ProvisionTenantService {
  constructor(
    private readonly repository: ProvisioningPersistence,
    private readonly delivery: VerificationDelivery,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    request: unknown;
    idempotencyKey: string;
    serviceId: string;
    correlationId?: string;
  }): Promise<ProvisionTenantResponse> {
    const request = provisionTenantRequestSchema.parse(input.request);
    const now = this.now();
    const plan = await this.repository.findActivePlan(request.planId, now);
    if (!plan) throw new Error("Requested plan is unavailable.");

    const verificationToken = randomBytes(32).toString("base64url");
    const handoffToken = randomBytes(32).toString("base64url");
    const verificationExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const handoffExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const passwordHash = await bcrypt.hash(request.owner.password, 12);
    const aggregate = await this.repository.provision({
      request,
      normalizedSlug: normalizeTenantSlug(request.tenant.slug),
      normalizedEmail: request.owner.email.trim().toLowerCase(),
      passwordHash,
      verifyExistingPassword: (hash) => bcrypt.compare(request.owner.password, hash),
      plan,
      idempotencyKey: input.idempotencyKey,
      verificationTokenDigest: createHash("sha256")
        .update(verificationToken, "utf8")
        .digest("hex"),
      handoffTokenDigest: createHash("sha256")
        .update(handoffToken, "utf8")
        .digest("hex"),
      correlationId: input.correlationId ?? randomUUID(),
      serviceId: input.serviceId,
      now,
      verificationExpiresAt,
      handoffExpiresAt,
    });

    if (!aggregate.ownerVerified && aggregate.verificationExpiresAt) {
      await this.delivery.deliver({
        email: aggregate.ownerEmail,
        token: verificationToken,
        expiresAt: aggregate.verificationExpiresAt,
        tenantName: aggregate.tenantName,
      });
    }
    return provisionTenantResponseSchema.parse(
      responseFromAggregate(aggregate, handoffToken),
    );
  }
}

function responseFromAggregate(
  aggregate: ProvisionedAggregate,
  handoffToken: string,
): ProvisionTenantResponse {
  const checks = [
    {
      code: "identity_verified",
      complete: aggregate.ownerVerified,
      requiredForActivation: true,
    },
    { code: "public_slug", complete: true, requiredForActivation: true },
    { code: "primary_location", complete: true, requiredForActivation: true },
    { code: "currency", complete: true, requiredForActivation: true },
    { code: "published_item", complete: false, requiredForActivation: true },
    { code: "payment_connected", complete: false, requiredForActivation: true },
    {
      code: "print_agent_connected",
      complete: false,
      requiredForActivation: false,
    },
  ];
  return {
    tenant: {
      id: aggregate.tenantId,
      name: aggregate.tenantName,
      slug: aggregate.tenantSlug,
      status: "onboarding",
      role: "owner",
    },
    membership: { role: "owner" },
    primaryLocation: {
      id: aggregate.locationId,
      name: aggregate.locationName,
      timezone: aggregate.timezone,
      status: "active",
    },
    entitlementSnapshot: {
      planId: aggregate.plan.planId,
      planVersion: aggregate.plan.version,
      entitlements: {
        catalogManagement: aggregate.plan.entitlements.catalog_management,
        onlinePayments: aggregate.plan.entitlements.online_payments,
        printing: aggregate.plan.entitlements.printing,
      },
      effectiveAt: aggregate.effectiveAt.toISOString(),
    },
    ownerVerification: aggregate.ownerVerified
      ? { status: "verified", expiresAt: null }
      : {
          status: "pending_verification",
          expiresAt: aggregate.verificationExpiresAt!.toISOString(),
        },
    readiness: { ready: false, checks },
    onboardingHandoff: {
      token: handoffToken,
      expiresAt: aggregate.handoffExpiresAt.toISOString(),
    },
  };
}

export type { ProvisionTenantRequest };
