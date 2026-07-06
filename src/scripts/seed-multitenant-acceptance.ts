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
    process.stdout.write(`Provisioned ${fixture.body.tenant.slug}.\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
