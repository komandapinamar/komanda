import type { Role } from "@/db/schema/platform";
import type { TenantContext } from "@/lib/tenant-context/types";
import { TenantAccessDeniedError } from "@/features/identity/application/session.service";

export function authorizeRole(
  context: TenantContext,
  allowedRoles: Role[],
): void {
  if (context.actor.kind !== "user") {
    throw new TenantAccessDeniedError("Access denied");
  }
  if (!allowedRoles.includes(context.actor.role)) {
    throw new TenantAccessDeniedError("Access denied");
  }
}

export function requireOwner(context: TenantContext): void {
  authorizeRole(context, ["owner"]);
}

export function requireOwnerOrAdmin(context: TenantContext): void {
  authorizeRole(context, ["owner", "admin"]);
}
