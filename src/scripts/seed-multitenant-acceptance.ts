import { multitenantProvisioningRequests } from "@/tests/fixtures/multitenant";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Acceptance fixtures are prohibited in production.");
  }
  if (process.env.KOMANDA_TEST_MODE !== "1") {
    throw new Error("Set KOMANDA_TEST_MODE=1 to seed acceptance fixtures.");
  }
  const baseUrl = process.env.KOMANDA_CORE_URL ?? "http://127.0.0.1:3000";
  const serviceToken = process.env.KOMANDA_BUSINESS_SERVICE_TOKEN;
  if (!serviceToken) throw new Error("KOMANDA_BUSINESS_SERVICE_TOKEN is required.");
  const provisioned: Array<{
    tenantId: string;
    tenantSlug: string;
    ownerEmail: string;
    planId: string;
  }> = [];
  for (const fixture of multitenantProvisioningRequests) {
    const response = await fetch(`${baseUrl}/api/v1/provisioning/tenants`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": fixture.idempotencyKey,
      },
      body: JSON.stringify(fixture.body),
    });
    if (!response.ok) {
      throw new Error(
        `Acceptance provisioning failed for ${fixture.body.tenant.slug}: ${response.status}.`,
      );
    }
    const result = (await response.json()) as {
      tenant: { id: string; slug: string };
    };
    provisioned.push({
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug,
      ownerEmail: fixture.body.owner.email,
      planId: fixture.body.planId,
    });
  }
  const [tenantA, tenantB] = provisioned;
  if (!tenantA || !tenantB) {
    throw new Error("Acceptance seed requires exactly two tenant fixtures.");
  }
  process.stdout.write(
    [
      `TENANT_A_ID=${tenantA.tenantId}`,
      `TENANT_A_SLUG=${tenantA.tenantSlug}`,
      `TENANT_B_ID=${tenantB.tenantId}`,
      `TENANT_B_SLUG=${tenantB.tenantSlug}`,
      `OWNER_A_EMAIL=${tenantA.ownerEmail}`,
      `OWNER_B_EMAIL=${tenantB.ownerEmail}`,
      `PLAN_A_ID=${tenantA.planId}`,
      `PLAN_B_ID=${tenantB.planId}`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
