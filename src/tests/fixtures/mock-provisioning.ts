export const mockProvisioningRequest = Object.freeze({
  planId: "development",
  owner: {
    email: "owner.mock@example.test",
    password: "Mock-only-password-2026!",
  },
  tenant: {
    name: "Komanda Mock",
    slug: "tenant-mock",
    currency: "ARS",
    timezone: "America/Argentina/Buenos_Aires",
  },
  primaryLocation: { name: "Local principal" },
});

export const mockProvisioningIdempotencyKey =
  "dev-mock-tenant-v1-000000000001";
