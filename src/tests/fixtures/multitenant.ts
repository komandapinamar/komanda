export const tenantA = Object.freeze({
  id: "00000000-0000-4000-8000-00000000000a",
  slug: "tenant-a",
  ownerId: "10000000-0000-4000-8000-00000000000a",
  locationId: "20000000-0000-4000-8000-00000000000a",
});

export const tenantB = Object.freeze({
  id: "00000000-0000-4000-8000-00000000000b",
  slug: "tenant-b",
  ownerId: "10000000-0000-4000-8000-00000000000b",
  locationId: "20000000-0000-4000-8000-00000000000b",
});

export const multitenantProvisioningRequests = [
  {
    idempotencyKey: "acceptance-tenant-a-v1-000000000001",
    body: {
      planId: "development",
      owner: { email: "owner.a@example.test", password: "Tenant-A-password-2026!" },
      tenant: {
        name: "Tenant A",
        slug: tenantA.slug,
        currency: "ARS",
        timezone: "America/Argentina/Buenos_Aires",
      },
      primaryLocation: { name: "Local A" },
    },
  },
  {
    idempotencyKey: "acceptance-tenant-b-v1-000000000001",
    body: {
      planId: "development",
      owner: { email: "owner.b@example.test", password: "Tenant-B-password-2026!" },
      tenant: {
        name: "Tenant B",
        slug: tenantB.slug,
        currency: "ARS",
        timezone: "America/Argentina/Buenos_Aires",
      },
      primaryLocation: { name: "Local B" },
    },
  },
] as const;
