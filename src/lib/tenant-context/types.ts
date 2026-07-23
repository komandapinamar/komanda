import type { Role } from "@/db/schema/platform";

export type TenantContextSource =
  | "public"
  | "administrative"
  | "webhook"
  | "agent"
  | "background"
  | "maintenance";

export type TenantActor =
  | {
      kind: "user";
      userId: string;
      membershipId: string;
      role: Role;
    }
  | { kind: "service"; serviceId: string }
  | { kind: "agent"; agentId: string; locationId: string }
  | { kind: "system"; process: string }
  | { kind: "anonymous"; tenantSlug: string };

const trustedTenantContext: unique symbol = Symbol("trustedTenantContext");

export type TenantContext = Readonly<{
  tenantId: string;
  correlationId: string;
  source: TenantContextSource;
  actor: TenantActor;
  locationId?: string;
  [trustedTenantContext]: true;
}>;

export type VerifiedTenantContextInput = Omit<
  TenantContext,
  typeof trustedTenantContext
>;

/** Construction boundary: call only after the corresponding resolver verifies authority. */
export function createVerifiedTenantContext(
  input: VerifiedTenantContextInput,
): TenantContext {
  if (!input.tenantId || !input.correlationId) {
    throw new Error("Verified tenant context requires tenant and correlation ids.");
  }

  return Object.freeze({
    ...input,
    [trustedTenantContext]: true as const,
  });
}
