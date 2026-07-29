import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { Pool, type PoolClient } from "pg";

export const acceptanceEnabled =
  process.env.E2E_MULTITENANT_READY === "1" &&
  Boolean(process.env.DATABASE_DIRECT_URL) &&
  Boolean(process.env.KOMANDA_BUSINESS_SERVICE_TOKEN) &&
  process.env.IDENTITY_VERIFICATION_DELIVERY === "capture";

export const fakeMercadoPagoEnabled =
  acceptanceEnabled &&
  process.env.MERCADOPAGO_API_BASE_URL?.includes(
    "/api/test-support/mercadopago",
  ) === true &&
  process.env.MERCADOPAGO_AUTHORIZATION_URL?.includes(
    "/api/test-support/mercadopago/authorization",
  ) === true &&
  Boolean(process.env.APP_ENCRYPTION_KEY_BASE64) &&
  Boolean(process.env.APP_ENCRYPTION_KEY_VERSION);

type ProvisionedTenant = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: "onboarding";
  };
  primaryLocation: { id: string };
  ownerVerification: {
    status: "pending_verification" | "verified";
  };
  readiness: { ready: boolean };
};

export type AcceptanceTenant = {
  id: string;
  name: string;
  slug: string;
  locationId: string;
};

export type AcceptancePair = {
  owner: { email: string; password: string };
  tenantA: AcceptanceTenant;
  tenantB: AcceptanceTenant;
  verificationToken: string | null;
};

function safeNamespace(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

async function jsonResponse<T>(response: Awaited<ReturnType<APIRequestContext["post"]>>) {
  const body = await response.text();
  if (!response.ok()) {
    throw new Error(`Acceptance request failed (${response.status()}): ${body}`);
  }
  return JSON.parse(body) as T;
}

async function latestVerificationToken(email: string) {
  const path = resolve(
    process.cwd(),
    process.env.IDENTITY_VERIFICATION_CAPTURE_PATH ??
      ".test-artifacts/verification.jsonl",
  );
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const contents = await readFile(path, "utf8").catch(() => "");
    const messages = contents
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as { email: string; token: string }];
        } catch {
          return [];
        }
      })
      .filter((message) => message.email === email);
    const token = messages.at(-1)?.token;
    if (token) return token;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Verification capture was not written for ${email}.`);
}

async function provision(
  request: APIRequestContext,
  input: {
    name: string;
    slug: string;
    owner: AcceptancePair["owner"];
  },
) {
  const response = await request.post("/api/v1/provisioning/tenants", {
    headers: {
      Authorization: `Bearer ${process.env.KOMANDA_BUSINESS_SERVICE_TOKEN}`,
      "Idempotency-Key": `e2e-${input.slug}-${randomUUID()}`,
    },
    data: {
      planId: "development",
      owner: input.owner,
      tenant: {
        name: input.name,
        slug: input.slug,
        currency: "ARS",
        timezone: "America/Argentina/Buenos_Aires",
      },
      primaryLocation: { name: `Local ${input.name}` },
    },
  });
  return jsonResponse<ProvisionedTenant>(response);
}

export async function arrangeTenantPair(
  request: APIRequestContext,
  label: string,
): Promise<AcceptancePair> {
  const namespace = `${safeNamespace(label)}-${randomUUID().slice(0, 8)}`;
  const owner = {
    email: `owner.${namespace}@example.test`,
    password: "Acceptance-password-2026!",
  };
  const first = await provision(request, {
    name: `${namespace} A`,
    slug: `${namespace}-a`,
    owner,
  });
  let verificationToken: string | null = null;
  if (first.ownerVerification.status === "pending_verification") {
    verificationToken = await latestVerificationToken(owner.email);
    const confirmed = await request.post(
      "/api/v1/auth/email-verifications/confirm",
      { data: { token: verificationToken } },
    );
    if (confirmed.status() !== 204) {
      throw new Error(`Owner verification failed with ${confirmed.status()}.`);
    }
  }
  const second = await provision(request, {
    name: `${namespace} B`,
    slug: `${namespace}-b`,
    owner,
  });
  const login = await request.post("/api/v1/auth/sessions", { data: owner });
  if (login.status() !== 204) {
    throw new Error(`Owner login failed with ${login.status()}.`);
  }
  return {
    owner,
    tenantA: {
      id: first.tenant.id,
      name: first.tenant.name,
      slug: first.tenant.slug,
      locationId: first.primaryLocation.id,
    },
    tenantB: {
      id: second.tenant.id,
      name: second.tenant.name,
      slug: second.tenant.slug,
      locationId: second.primaryLocation.id,
    },
    verificationToken,
  };
}

async function withOwnerClient<T>(operation: (client: PoolClient) => Promise<T>) {
  const connectionString = process.env.DATABASE_DIRECT_URL;
  if (!connectionString) throw new Error("DATABASE_DIRECT_URL is required.");
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    return await operation(client);
  } finally {
    client.release();
    await pool.end();
  }
}

export function setTenantOperational(
  tenantId: string,
  options: { active?: boolean; printing?: boolean } = {},
) {
  return withOwnerClient(async (client) => {
    await client.query(
      `update tenants
       set status = $2, activated_at = case when $2 = 'active' then now() else activated_at end,
           suspended_at = case when $2 = 'suspended' then now() else null end,
           updated_at = now()
       where id = $1`,
      [tenantId, options.active === false ? "suspended" : "active"],
    );
    await client.query(
      `update tenant_settings
       set sales_enabled = $2, printing_enabled = $3, updated_at = now()
       where tenant_id = $1`,
      [tenantId, options.active !== false, options.printing === true],
    );
  });
}

export async function createPublishedCatalog(
  request: APIRequestContext,
  tenant: AcceptanceTenant,
  label: string,
) {
  const categoryResponse = await request.post(
    `/api/v1/tenants/${tenant.id}/catalog/categories`,
    {
      data: {
        name: `Categoría ${label}`,
        description: null,
        sortOrder: 0,
        status: "active",
      },
    },
  );
  const category = await jsonResponse<{ id: string; version: number }>(
    categoryResponse,
  );
  const itemResponse = await request.post(
    `/api/v1/tenants/${tenant.id}/catalog/items`,
    {
      data: {
        categoryId: category.id,
        name: `Producto ${label}`,
        description: `Producto sintético ${label}`,
        price: "3500.00",
        currency: "ARS",
        status: "active",
        sortOrder: 0,
        addonGroupIds: [],
      },
    },
  );
  const item = await jsonResponse<{
    id: string;
    version: number;
    price: string;
  }>(itemResponse);
  return { category, item };
}

export async function createCart(
  request: APIRequestContext,
  tenant: AcceptanceTenant,
  itemId: string,
  price = "3500.00",
) {
  const response = await request.post(
    `/api/v1/storefronts/${tenant.slug}/carts`,
    {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        lines: [
          {
            kind: "item",
            resourceId: itemId,
            quantity: 1,
            optionIds: [],
            confirmedUnitPrice: price,
          },
        ],
      },
    },
  );
  return jsonResponse<{ id: string; version: number }>(response);
}

export async function createDirectOrder(
  request: APIRequestContext,
  tenant: AcceptanceTenant,
  cartId: string,
  customerName: string,
) {
  const response = await request.post(
    `/api/v1/tenants/${tenant.id}/orders`,
    {
      headers: { "Idempotency-Key": randomUUID() },
      data: { cartId, customer: { name: customerName } },
    },
  );
  return jsonResponse<{
    id: string;
    purchaseNumber: string;
    fulfillmentStatus: "approved" | "preparing" | "ready" | "delivered";
    version: number;
  }>(response);
}

export function expirePrintLease(jobId: string) {
  return withOwnerClient((client) =>
    client.query(
      `update print_jobs set lease_expires_at = now() - interval '1 second'
       where id = $1 and status = 'processing'`,
      [jobId],
    ),
  );
}
