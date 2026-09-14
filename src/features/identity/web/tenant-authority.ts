import { coreSessionService, sessionTokenFromRequest } from "./authenticated-session";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export async function administrativeTenantContext(
  request: Request,
  tenantId: string,
  correlationId: string,
) {
  const token = await sessionTokenFromRequest(request);
  if (!token) throw new Error("INVALID_SESSION");
  const authority = await coreSessionService().authorizeTenant(token, tenantId);
  return createVerifiedTenantContext({
    tenantId,
    correlationId,
    source: "administrative",
    actor: {
      kind: "user",
      userId: authority.session.userId,
      membershipId: authority.membership.id,
      role: authority.membership.role,
    },
  });
}
