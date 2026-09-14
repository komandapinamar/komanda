import type { Role } from "@/db/schema/platform";
import {
  createVerifiedTenantContext,
  type TenantContext,
} from "./types";

export class TenantResolutionError extends Error {
  readonly code = "TENANT_CONTEXT_NOT_FOUND";
}

type ResolvedTenant = {
  tenantId: string;
  status: "onboarding" | "active" | "suspended";
};

export interface TenantResolverStore {
  resolvePublicSlug(normalizedSlug: string): Promise<ResolvedTenant | null>;
  resolveAdministrativeAuthority(input: {
    sessionToken: string;
    tenantId: string;
  }): Promise<
      | (ResolvedTenant & {
        userId: string;
        membershipId: string;
        role: Role;
      })
    | null
  >;
  resolveWebhookRoute(input: {
    provider: string;
    routingKey: string;
    providerResourceId?: string;
  }): Promise<(ResolvedTenant & { integrationId: string }) | null>;
  resolvePrintAgent(token: string): Promise<
    | (ResolvedTenant & { agentId: string; locationId: string })
    | null
  >;
  resolvePersistedWork(input: {
    tenantId: string;
    workType: string;
    workId: string;
  }): Promise<ResolvedTenant | null>;
  authorizeMaintenance(input: {
    tenantId: string;
    operation: string;
    authorizationId: string;
  }): Promise<ResolvedTenant | null>;
}

function required<T>(value: T | null): T {
  if (!value) throw new TenantResolutionError("Tenant context is unavailable.");
  return value;
}

export async function resolvePublicTenantContext(
  store: TenantResolverStore,
  input: { normalizedSlug: string; correlationId: string },
): Promise<TenantContext> {
  const resolved = required(
    await store.resolvePublicSlug(input.normalizedSlug),
  );
  if (resolved.status !== "active") {
    throw new TenantResolutionError("Tenant context is unavailable.");
  }
  return createVerifiedTenantContext({
    tenantId: resolved.tenantId,
    correlationId: input.correlationId,
    source: "public",
    actor: { kind: "anonymous", tenantSlug: input.normalizedSlug },
  });
}

export async function resolveAdministrativeTenantContext(
  store: TenantResolverStore,
  input: { sessionToken: string; tenantId: string; correlationId: string },
) {
  const resolved = required(
    await store.resolveAdministrativeAuthority(input),
  );
  if (resolved.status === "suspended") {
    throw new TenantResolutionError("Tenant context is unavailable.");
  }
  return createVerifiedTenantContext({
    tenantId: resolved.tenantId,
    correlationId: input.correlationId,
    source: "administrative",
    actor: {
      kind: "user",
      userId: resolved.userId,
      membershipId: resolved.membershipId,
      role: resolved.role,
    },
  });
}

export async function resolveWebhookTenantContext(
  store: TenantResolverStore,
  input: {
    provider: string;
    routingKey: string;
    providerResourceId?: string;
    signatureVerified: boolean;
    correlationId: string;
  },
) {
  if (!input.signatureVerified) {
    throw new TenantResolutionError("Tenant context is unavailable.");
  }
  const resolved = required(await store.resolveWebhookRoute(input));
  return createVerifiedTenantContext({
    tenantId: resolved.tenantId,
    correlationId: input.correlationId,
    source: "webhook",
    actor: { kind: "service", serviceId: `${input.provider}:webhook` },
  });
}

export async function resolveAgentTenantContext(
  store: TenantResolverStore,
  input: { token: string; correlationId: string },
) {
  const resolved = required(await store.resolvePrintAgent(input.token));
  if (resolved.status === "suspended") {
    throw new TenantResolutionError("Tenant context is unavailable.");
  }
  return createVerifiedTenantContext({
    tenantId: resolved.tenantId,
    locationId: resolved.locationId,
    correlationId: input.correlationId,
    source: "agent",
    actor: {
      kind: "agent",
      agentId: resolved.agentId,
      locationId: resolved.locationId,
    },
  });
}

export async function resolveBackgroundTenantContext(
  store: TenantResolverStore,
  input: {
    tenantId: string;
    workType: string;
    workId: string;
    process: string;
    correlationId: string;
  },
) {
  const resolved = required(await store.resolvePersistedWork(input));
  return createVerifiedTenantContext({
    tenantId: resolved.tenantId,
    correlationId: input.correlationId,
    source: "background",
    actor: { kind: "system", process: input.process },
  });
}

export async function resolveMaintenanceTenantContext(
  store: TenantResolverStore,
  input: {
    tenantId: string;
    operation: string;
    authorizationId: string;
    operator: string;
    correlationId: string;
  },
) {
  const resolved = required(await store.authorizeMaintenance(input));
  return createVerifiedTenantContext({
    tenantId: resolved.tenantId,
    correlationId: input.correlationId,
    source: "maintenance",
    actor: { kind: "system", process: `maintenance:${input.operator}` },
  });
}
