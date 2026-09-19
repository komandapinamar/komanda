import "server-only";

import { and, eq } from "drizzle-orm";
import {
  catalogItems,
  integrationAccounts,
  tenantLocations,
  tenants,
  tenantSettings,
} from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { withTenantTransaction } from "@/db/tenant-transaction";
import type {
  LiveMembership,
  SessionIdentity,
} from "@/features/identity/application/session.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export type TenantReadinessCheck = {
  code: string;
  complete: boolean;
  requiredForActivation: boolean;
};

export type TenantEligibilityResult = {
  ready: boolean;
  orderingAvailable: boolean;
  checks: TenantReadinessCheck[];
  tenant: {
    id: string;
    name: string;
    slug: string;
    normalizedSlug: string;
    defaultCurrency: string;
    status: "onboarding" | "active" | "suspended";
  };
  primaryLocation: {
    id: string;
    name: string;
    address: unknown;
  } | null;
  salesEnabled: boolean;
};

export async function fetchTenantReadiness(
  transaction: TenantTransaction,
  tenantId: string,
): Promise<TenantEligibilityResult> {
  const [tenant] = await transaction
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      normalizedSlug: tenants.normalizedSlug,
      defaultCurrency: tenants.defaultCurrency,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new Error("Tenant readiness is unavailable.");

  const [location] = await transaction
    .select({
      id: tenantLocations.id,
      name: tenantLocations.name,
      address: tenantLocations.address,
    })
    .from(tenantLocations)
    .where(
      and(
        eq(tenantLocations.tenantId, tenantId),
        eq(tenantLocations.isPrimary, true),
        eq(tenantLocations.status, "active"),
      ),
    )
    .limit(1);

  const [publishedItem] = await transaction
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.tenantId, tenantId),
        eq(catalogItems.status, "active"),
      ),
    )
    .limit(1);

  const [paymentIntegration] = await transaction
    .select({ id: integrationAccounts.id })
    .from(integrationAccounts)
    .where(
      and(
        eq(integrationAccounts.tenantId, tenantId),
        eq(integrationAccounts.provider, "mercadopago"),
        eq(integrationAccounts.status, "active"),
      ),
    )
    .limit(1);

  const [settings] = await transaction
    .select({ salesEnabled: tenantSettings.salesEnabled })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const checks: TenantReadinessCheck[] = [
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
    {
      code: "published_item",
      complete: Boolean(publishedItem),
      requiredForActivation: true,
    },
    {
      code: "payment_connected",
      complete: Boolean(paymentIntegration),
      requiredForActivation: true,
    },
    {
      code: "print_agent_connected",
      complete: false,
      requiredForActivation: false,
    },
  ];

  const ready = checks
    .filter((check) => check.requiredForActivation)
    .every((check) => check.complete);

  const salesEnabled = settings?.salesEnabled ?? false;
  const orderingAvailable = tenant.status === "active" && salesEnabled && ready;

  return {
    ready,
    orderingAvailable,
    checks,
    tenant,
    primaryLocation: location ?? null,
    salesEnabled,
  };
}

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
      const eligibility = await fetchTenantReadiness(transaction, membership.tenantId);
      return {
        ready: eligibility.ready,
        checks: eligibility.checks,
      };
    });
  }
}
