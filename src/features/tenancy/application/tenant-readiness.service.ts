import "server-only";

import { and, eq } from "drizzle-orm";
import { tenantLocations, tenants } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import type {
  LiveMembership,
  SessionIdentity,
} from "@/features/identity/application/session.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export class TenantReadinessService {
  async get(session: SessionIdentity, membership: LiveMembership) {
    const context = createVerifiedTenantContext({
      tenantId: membership.tenantId,
      correlationId: crypto.randomUUID(),
      source: "administrative",
      actor: {
        kind: "user",
        userId: session.userId,
        membershipId: membership.id,
        role: membership.role,
      },
    });
    return withTenantTransaction(context, async (transaction) => {
      const [tenant] = await transaction
        .select()
        .from(tenants)
        .where(eq(tenants.id, membership.tenantId))
        .limit(1);
      const [location] = await transaction
        .select()
        .from(tenantLocations)
        .where(
          and(
            eq(tenantLocations.tenantId, membership.tenantId),
            eq(tenantLocations.isPrimary, true),
          ),
        )
        .limit(1);
      if (!tenant) throw new Error("Tenant readiness is unavailable.");
      const checks = [
        {
          code: "identity_verified",
          complete: session.userStatus === "active",
          requiredForActivation: true,
        },
        {
          code: "public_slug",
          complete: tenant.normalizedSlug.length > 0,
          requiredForActivation: true,
        },
        {
          code: "primary_location",
          complete: Boolean(location),
          requiredForActivation: true,
        },
        {
          code: "currency",
          complete: tenant.defaultCurrency.length === 3,
          requiredForActivation: true,
        },
        { code: "published_item", complete: false, requiredForActivation: true },
        {
          code: "payment_connected",
          complete: false,
          requiredForActivation: true,
        },
        {
          code: "print_agent_connected",
          complete: false,
          requiredForActivation: false,
        },
      ];
      return {
        ready: checks
          .filter((check) => check.requiredForActivation)
          .every((check) => check.complete),
        checks,
      };
    });
  }
}
