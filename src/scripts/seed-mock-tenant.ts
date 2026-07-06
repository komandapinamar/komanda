import {
  mockProvisioningIdempotencyKey,
  mockProvisioningRequest,
} from "@/tests/fixtures/mock-provisioning";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock tenant bootstrap is prohibited in production.");
  }
  if (process.env.KOMANDA_TEST_MODE !== "1") {
    throw new Error("Set KOMANDA_TEST_MODE=1 to run the non-production bootstrap.");
  }
  const baseUrl = process.env.KOMANDA_CORE_URL ?? "http://127.0.0.1:3000";
  const serviceToken = process.env.KOMANDA_BUSINESS_SERVICE_TOKEN;
  if (!serviceToken) throw new Error("KOMANDA_BUSINESS_SERVICE_TOKEN is required.");
  const response = await fetch(`${baseUrl}/api/v1/provisioning/tenants`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": mockProvisioningIdempotencyKey,
    },
    body: JSON.stringify(mockProvisioningRequest),
  });
  if (!response.ok) {
    throw new Error(`Mock tenant bootstrap failed with status ${response.status}.`);
  }
  process.stdout.write(`${JSON.stringify(await response.json(), null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
