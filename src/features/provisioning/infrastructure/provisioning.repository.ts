import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import {
  identityVerificationChallenges,
  onboardingHandoffs,
  planDefinitions,
  tenantCounters,
  tenantEntitlementSnapshots,
  tenantLocations,
  tenantMemberships,
  tenants,
  tenantSettings,
  users,
  type OperationalEntitlements,
} from "@/db/schema";
import { db } from "@/db";
import {
  setTenantTransactionContext,
  withPlatformServiceTransaction,
} from "@/db/tenant-transaction";
import type { ProvisionTenantRequest } from "@/features/provisioning/domain/provisioning.schemas";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export type ResolvedPlan = {
  planId: string;
  version: number;
  entitlements: OperationalEntitlements;
};

export type ProvisionedAggregate = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userId: string;
  ownerEmail: string;
  ownerVerified: boolean;
  locationId: string;
  locationName: string;
  timezone: string;
  plan: ResolvedPlan;
  effectiveAt: Date;
  verificationExpiresAt: Date | null;
  handoffExpiresAt: Date;
};

export class ProvisioningConflictError extends Error {}

export class DatabaseProvisioningRepository {
  async findActivePlan(planId: string, now: Date): Promise<ResolvedPlan | null> {
    const [plan] = await db
      .select()
      .from(planDefinitions)
      .where(
        and(
          eq(planDefinitions.planId, planId),
          eq(planDefinitions.status, "active"),
          lte(planDefinitions.effectiveFrom, now),
          or(isNull(planDefinitions.retiredAt), gt(planDefinitions.retiredAt, now)),
        ),
      )
      .orderBy(desc(planDefinitions.version))
      .limit(1);
    return plan
      ? {
          planId: plan.planId,
          version: plan.version,
          entitlements: plan.entitlements,
        }
      : null;
  }

  async provision(input: {
    request: ProvisionTenantRequest;
    normalizedSlug: string;
    normalizedEmail: string;
    passwordHash: string;
    verifyExistingPassword: (hash: string) => Promise<boolean>;
    plan: ResolvedPlan;
    idempotencyKey: string;
    verificationTokenDigest: string;
    handoffTokenDigest: string;
    correlationId: string;
    serviceId: string;
    now: Date;
    verificationExpiresAt: Date;
    handoffExpiresAt: Date;
  }): Promise<ProvisionedAggregate> {
    return withPlatformServiceTransaction(
      { serviceId: input.serviceId, correlationId: input.correlationId },
      async (transaction) => {
        const idempotency = new IdempotencyService(transaction);
        const claim = await idempotency.claim({
          tenantId: null,
          scope: "provision-tenant",
          key: input.idempotencyKey,
          request: input.request,
          retentionSeconds: 7 * 24 * 60 * 60,
        });

        if (claim.replayed) {
          const replay = claim.body as { tenantId?: string } | null;
          if (!replay?.tenantId) {
            throw new Error("Invalid provisioning idempotency replay.");
          }
          await setTenantTransactionContext(transaction, replay.tenantId);
          return this.rotateCredentialsAndLoad(transaction, replay.tenantId, input);
        }

        const existingSlug = await transaction
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.normalizedSlug, input.normalizedSlug))
          .limit(1);
        if (existingSlug[0]) {
          throw new ProvisioningConflictError("Tenant slug is unavailable.");
        }

        const [existingUser] = await transaction
          .select()
          .from(users)
          .where(eq(users.normalizedEmail, input.normalizedEmail))
          .limit(1);
        if (
          existingUser &&
          !(await input.verifyExistingPassword(existingUser.passwordHash))
        ) {
          throw new ProvisioningConflictError("Owner identity cannot be linked.");
        }
        if (existingUser?.status === "disabled") {
          throw new ProvisioningConflictError("Owner identity cannot be linked.");
        }

        const tenantId = randomUUID();
        const locationId = randomUUID();
        const userId = existingUser?.id ?? randomUUID();

        await setTenantTransactionContext(transaction, tenantId);
        if (!existingUser) {
          await transaction.insert(users).values({
            id: userId,
            email: input.request.owner.email.trim(),
            normalizedEmail: input.normalizedEmail,
            passwordHash: input.passwordHash,
            status: "pending_verification",
          });
        }
        await transaction.insert(tenants).values({
          id: tenantId,
          name: input.request.tenant.name,
          slug: input.request.tenant.slug,
          normalizedSlug: input.normalizedSlug,
          status: "onboarding",
          defaultCurrency: input.request.tenant.currency,
          defaultTimezone: input.request.tenant.timezone,
        });
        await transaction.insert(tenantLocations).values({
          id: locationId,
          tenantId,
          name: input.request.primaryLocation.name,
          timezone: input.request.tenant.timezone,
          status: "active",
          isPrimary: true,
        });
        await transaction.insert(tenantMemberships).values({
          tenantId,
          userId,
          role: "owner",
          status: "active",
        });
        await transaction.insert(tenantSettings).values({
          tenantId,
          salesEnabled: false,
          printingEnabled: false,
          orderPrefix: input.normalizedSlug
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 8)
            .toUpperCase() || "K",
        });
        await transaction.insert(tenantCounters).values({
          tenantId,
          counterType: "purchase_number",
          currentValue: BigInt(0),
        });
        await transaction.insert(tenantEntitlementSnapshots).values({
          tenantId,
          planId: input.plan.planId,
          planVersion: input.plan.version,
          entitlements: input.plan.entitlements,
          sourceRequestId: input.idempotencyKey,
          effectiveAt: input.now,
        });
        if (existingUser?.status !== "active") {
          await transaction
            .update(identityVerificationChallenges)
            .set({ consumedAt: input.now })
            .where(
              and(
                eq(identityVerificationChallenges.userId, userId),
                isNull(identityVerificationChallenges.consumedAt),
              ),
            );
          await transaction.insert(identityVerificationChallenges).values({
            userId,
            tokenDigest: input.verificationTokenDigest,
            expiresAt: input.verificationExpiresAt,
          });
        }
        await transaction.insert(onboardingHandoffs).values({
          tenantId,
          userId,
          tokenDigest: input.handoffTokenDigest,
          expiresAt: input.handoffExpiresAt,
        });
        const context = createVerifiedTenantContext({
          tenantId,
          correlationId: input.correlationId,
          source: "administrative",
          actor: { kind: "service", serviceId: input.serviceId },
        });
        await appendAuditEvent(transaction, context, {
          action: "tenant.provisioned",
          resourceType: "tenant",
          resourceId: tenantId,
          outcome: "allowed",
          metadata: { planId: input.plan.planId },
        });
        await appendOutboxEvent(transaction, context, {
          aggregateType: "tenant",
          aggregateId: tenantId,
          eventType: "tenant.provisioned",
          payload: { planId: input.plan.planId, ownerUserId: userId },
        });
        await idempotency.complete(claim.recordId, 201, { tenantId });

        return {
          tenantId,
          tenantName: input.request.tenant.name,
          tenantSlug: input.request.tenant.slug,
          userId,
          ownerEmail: input.request.owner.email.trim(),
          ownerVerified: existingUser?.status === "active",
          locationId,
          locationName: input.request.primaryLocation.name,
          timezone: input.request.tenant.timezone,
          plan: input.plan,
          effectiveAt: input.now,
          verificationExpiresAt:
            existingUser?.status === "active"
              ? null
              : input.verificationExpiresAt,
          handoffExpiresAt: input.handoffExpiresAt,
        };
      },
    );
  }

  private async rotateCredentialsAndLoad(
    transaction: Parameters<
      Parameters<typeof withPlatformServiceTransaction>[1]
    >[0],
    tenantId: string,
    input: Parameters<DatabaseProvisioningRepository["provision"]>[0],
  ): Promise<ProvisionedAggregate> {
    const [tenant] = await transaction
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const [membership] = await transaction
      .select()
      .from(tenantMemberships)
      .where(eq(tenantMemberships.tenantId, tenantId))
      .limit(1);
    const [user] = membership
      ? await transaction
          .select()
          .from(users)
          .where(eq(users.id, membership.userId))
          .limit(1)
      : [];
    const [location] = await transaction
      .select()
      .from(tenantLocations)
      .where(
        and(
          eq(tenantLocations.tenantId, tenantId),
          eq(tenantLocations.isPrimary, true),
        ),
      )
      .limit(1);
    const [snapshot] = await transaction
      .select()
      .from(tenantEntitlementSnapshots)
      .where(
        and(
          eq(tenantEntitlementSnapshots.tenantId, tenantId),
          isNull(tenantEntitlementSnapshots.supersededAt),
        ),
      )
      .limit(1);
    if (!tenant || !membership || !user || !location || !snapshot) {
      throw new Error("Provisioning replay aggregate is incomplete.");
    }

    await transaction
      .update(onboardingHandoffs)
      .set({ consumedAt: input.now })
      .where(
        and(
          eq(onboardingHandoffs.tenantId, tenantId),
          eq(onboardingHandoffs.userId, user.id),
          isNull(onboardingHandoffs.consumedAt),
        ),
      );
    await transaction.insert(onboardingHandoffs).values({
      tenantId,
      userId: user.id,
      tokenDigest: input.handoffTokenDigest,
      expiresAt: input.handoffExpiresAt,
    });

    const ownerVerified = user.status === "active";
    if (!ownerVerified) {
      await transaction
        .update(identityVerificationChallenges)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(identityVerificationChallenges.userId, user.id),
            isNull(identityVerificationChallenges.consumedAt),
          ),
        );
      await transaction.insert(identityVerificationChallenges).values({
        userId: user.id,
        tokenDigest: input.verificationTokenDigest,
        expiresAt: input.verificationExpiresAt,
      });
    }

    return {
      tenantId,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      userId: user.id,
      ownerEmail: user.email,
      ownerVerified,
      locationId: location.id,
      locationName: location.name,
      timezone: location.timezone,
      plan: {
        planId: snapshot.planId,
        version: snapshot.planVersion,
        entitlements: snapshot.entitlements,
      },
      effectiveAt: snapshot.effectiveAt,
      verificationExpiresAt: ownerVerified
        ? null
        : input.verificationExpiresAt,
      handoffExpiresAt: input.handoffExpiresAt,
    };
  }
}
