import type { OperationalEntitlements } from "@/db/schema";
import { operationalEntitlementsSchema } from "@/features/provisioning/domain/provisioning.schemas";

export type Entitlement = keyof OperationalEntitlements;

export interface EntitlementRepository {
  findActivePlan(planId: string, at: Date): Promise<{
    planId: string;
    version: number;
    entitlements: unknown;
    effectiveFrom: Date;
  } | null>;
  findCurrentSnapshot(tenantId: string): Promise<{
    entitlements: unknown;
  } | null>;
}

export class PlanUnavailableError extends Error {}
export class EntitlementDeniedError extends Error {}

export class EntitlementService {
  constructor(
    private readonly repository: EntitlementRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolvePlan(planId: string) {
    const plan = await this.repository.findActivePlan(planId, this.now());
    if (!plan) throw new PlanUnavailableError("Requested plan is unavailable.");
    const entitlements = operationalEntitlementsSchema.safeParse(
      plan.entitlements,
    );
    if (!entitlements.success) {
      throw new PlanUnavailableError("Requested plan is unavailable.");
    }
    return { ...plan, entitlements: entitlements.data };
  }

  async require(tenantId: string, entitlement: Entitlement) {
    const snapshot = await this.repository.findCurrentSnapshot(tenantId);
    const parsed = operationalEntitlementsSchema.safeParse(
      snapshot?.entitlements,
    );
    if (!parsed.success || parsed.data[entitlement] !== true) {
      throw new EntitlementDeniedError("Capability is not available.");
    }
  }
}
