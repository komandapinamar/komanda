import "dotenv/config";

import { Pool, type DatabaseError } from "pg";

const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_LOCATION_ID = "00000000-0000-4000-8000-000000000002";
const DEFAULT_CATEGORY_ID = "00000000-0000-4000-8000-000000000101";
const DEFAULT_ITEM_ONE_ID = "00000000-0000-4000-8000-000000000201";
const DEFAULT_ITEM_TWO_ID = "00000000-0000-4000-8000-000000000202";

function assertSafeEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock storefront seed is prohibited in production.");
  }
  if (process.env.KOMANDA_TEST_MODE !== "1") {
    throw new Error("Set KOMANDA_TEST_MODE=1 to run the mock storefront seed.");
  }
}

function normalizedSlug(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error(`Invalid mock tenant slug: ${value}`);
  }
  return normalized;
}

function isMissingRelation(error: unknown) {
  return typeof error === "object" && error !== null && (error as DatabaseError).code === "42P01";
}

async function main() {
  assertSafeEnvironment();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const slug = normalizedSlug(
    process.env.MOCK_TENANT_SLUG ??
      process.env.NEXT_PUBLIC_MOCK_TENANT_SLUG ??
      "tenant-mock",
  );
  const tenantName = process.env.MOCK_TENANT_NAME ?? "Komanda Mock";
  const tenantId = process.env.MOCK_TENANT_ID ?? DEFAULT_TENANT_ID;
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `select
        set_config('app.tenant_id', '', true),
        set_config('app.user_id', '', true),
        set_config('app.service_id', 'mock-storefront-seed', true),
        set_config('app.agent_id', '', true),
        set_config('app.correlation_id', 'mock-storefront-seed', true)`,
    );

    const tenant = await client.query<{ id: string }>(
      `insert into tenants
        (id, name, slug, normalized_slug, status, default_currency, default_timezone, activated_at)
       values
        ($1, $2, $3, $3, 'active', 'ARS', 'America/Argentina/Buenos_Aires', now())
       on conflict (normalized_slug) do update set
        name = excluded.name,
        slug = excluded.slug,
        status = 'active',
        activated_at = coalesce(tenants.activated_at, now()),
        suspended_at = null,
        updated_at = now()
       returning id`,
      [tenantId, tenantName, slug],
    );
    const resolvedTenantId = tenant.rows[0]?.id;
    if (!resolvedTenantId) throw new Error("Could not create mock tenant.");

    await client.query("select set_config('app.tenant_id', $1, true)", [resolvedTenantId]);
    await client.query(
      `insert into tenant_locations
        (id, tenant_id, name, timezone, status, is_primary)
       select $1, $2, 'Local principal', 'America/Argentina/Buenos_Aires', 'active', true
       where not exists (
        select 1 from tenant_locations where tenant_id = $2 and is_primary = true
       )`,
      [DEFAULT_LOCATION_ID, resolvedTenantId],
    );
    await client.query(
      `update tenant_locations
       set status = 'active', updated_at = now()
       where tenant_id = $1 and is_primary = true`,
      [resolvedTenantId],
    );
    await client.query(
      `insert into tenant_settings (tenant_id, sales_enabled, printing_enabled, order_prefix)
       values ($1, true, false, 'MOCK')
       on conflict (tenant_id) do update set
        sales_enabled = true,
        updated_at = now()`,
      [resolvedTenantId],
    );
    await client.query(
      `insert into tenant_counters (tenant_id, counter_type, current_value)
       values ($1, 'purchase_number', 0)
       on conflict (tenant_id, counter_type) do nothing`,
      [resolvedTenantId],
    );
    await client.query(
      `insert into catalog_categories
        (id, tenant_id, name, normalized_name, description, sort_order, status)
       select $1, $2, 'Hamburguesas', 'hamburguesas', 'Menu de prueba', 0, 'active'
       where not exists (
        select 1 from catalog_categories
        where tenant_id = $2 and normalized_name = 'hamburguesas' and archived_at is null
       )`,
      [DEFAULT_CATEGORY_ID, resolvedTenantId],
    );
    await client.query(
      `update catalog_categories
       set status = 'active', updated_at = now()
       where tenant_id = $1 and normalized_name = 'hamburguesas' and archived_at is null`,
      [resolvedTenantId],
    );
    const category = await client.query<{ id: string }>(
      `select id from catalog_categories
       where tenant_id = $1 and normalized_name = 'hamburguesas' and archived_at is null
       limit 1`,
      [resolvedTenantId],
    );
    const categoryId = category.rows[0]?.id;
    if (!categoryId) throw new Error("Could not create mock category.");

    const items = [
      {
        id: DEFAULT_ITEM_ONE_ID,
        name: "Burger clasica",
        normalizedName: "burger-clasica",
        description: "Medallon, queso, lechuga y salsa de la casa.",
        price: "6900.00",
        sortOrder: 0,
      },
      {
        id: DEFAULT_ITEM_TWO_ID,
        name: "Papas cheddar",
        normalizedName: "papas-cheddar",
        description: "Papas con cheddar y verdeo.",
        price: "4200.00",
        sortOrder: 1,
      },
    ];
    for (const item of items) {
      await client.query(
        `insert into catalog_items
          (id, tenant_id, category_id, name, normalized_name, description, price, currency, status, sort_order)
         select $1, $2, $3, $4, $5, $6, $7, 'ARS', 'active', $8
         where not exists (
          select 1 from catalog_items
          where tenant_id = $2 and normalized_name = $5 and archived_at is null
         )`,
        [
          item.id,
          resolvedTenantId,
          categoryId,
          item.name,
          item.normalizedName,
          item.description,
          item.price,
          item.sortOrder,
        ],
      );
      await client.query(
        `update catalog_items
         set status = 'active', updated_at = now()
         where tenant_id = $1 and normalized_name = $2 and archived_at is null`,
        [resolvedTenantId, item.normalizedName],
      );
    }

    await client.query("commit");
    process.stdout.write(
      [
        `Mock storefront ready: ${slug}`,
        `Tenant ID: ${resolvedTenantId}`,
        `Local URL: http://${slug}.localhost:3000/order`,
      ].join("\n") + "\n",
    );
  } catch (error) {
    await client.query("rollback");
    if (isMissingRelation(error)) {
      throw new Error("Database is not migrated. Run npm run db:migrate before seeding.");
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
