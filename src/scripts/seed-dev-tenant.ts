import "dotenv/config";

import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { Pool, type DatabaseError } from "pg";
import { normalizeTenantSlug } from "@/features/provisioning/domain/provisioning.schemas";

const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_LOCATION_ID = "00000000-0000-4000-8000-000000000002";
const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000003";
const DEFAULT_CATEGORY_ID = "00000000-0000-4000-8000-000000000101";
const DEFAULT_ITEM_ONE_ID = "00000000-0000-4000-8000-000000000201";
const DEFAULT_ITEM_TWO_ID = "00000000-0000-4000-8000-000000000202";
const DEFAULT_PLAN_DEFINITION_ID = "00000000-0000-4000-8000-0000000plan0";

function assertSafeEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev seed is prohibited in production.");
  }
}

function isMissingRelation(error: unknown) {
  return typeof error === "object" && error !== null && (error as DatabaseError).code === "42P01";
}

async function main() {
  assertSafeEnvironment();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const slugRaw = process.env.DEV_TENANT_SLUG ?? "mi-negocio";
  const slug = normalizeTenantSlug(slugRaw);
  const tenantName = process.env.DEV_TENANT_NAME ?? "Mi Negocio";
  const ownerEmail = (process.env.DEV_OWNER_EMAIL ?? "owner@example.com").trim().toLowerCase();
  const ownerPassword = process.env.DEV_OWNER_PASSWORD ?? "komanda-dev-2026";
  const tenantId = process.env.DEV_TENANT_ID ?? DEFAULT_TENANT_ID;
  const userId = process.env.DEV_USER_ID ?? DEFAULT_USER_ID;
  const planId = "development";

  const passwordHash = await bcrypt.hash(ownerPassword, 12);

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `select
        set_config('app.tenant_id', '', true),
        set_config('app.user_id', '', true),
        set_config('app.service_id', 'dev-seed', true),
        set_config('app.agent_id', '', true),
        set_config('app.correlation_id', 'dev-seed', true)`,
    );

    const tenantResult = await client.query<{ id: string }>(
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
    const resolvedTenantId = tenantResult.rows[0]?.id;
    if (!resolvedTenantId) throw new Error("Could not create tenant.");

    await client.query(
      `insert into users
        (id, email, normalized_email, password_hash, status, email_verified_at)
       values ($1, $2, $2, $3, 'active', now())
       on conflict (normalized_email) do update set
        password_hash = excluded.password_hash,
        status = 'active',
        email_verified_at = coalesce(users.email_verified_at, now()),
        updated_at = now()
       returning id`,
      [userId, ownerEmail, passwordHash],
    );

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
      `insert into tenant_memberships
        (tenant_id, user_id, role, status)
       values ($1, $2, 'owner', 'active')
       on conflict (tenant_id, user_id) where status = 'revoked' do nothing
       on conflict (tenant_id, user_id) do update set
        status = 'active',
        updated_at = now()`,
      [resolvedTenantId, userId],
    );

    await client.query(
      `insert into tenant_settings (tenant_id, sales_enabled, printing_enabled, order_prefix)
       values ($1, true, false, 'DEV')
       on conflict (tenant_id) do update set
        sales_enabled = true,
        updated_at = now()`,
      [resolvedTenantId],
    );

    await client.query(
      `insert into tenant_counters (tenant_id, counter_type, current_value)
       values
        ($1, 'purchase_number', 0),
        ($1, 'order_event_sequence', 0)
       on conflict (tenant_id, counter_type) do nothing`,
      [resolvedTenantId],
    );

    const planResult = await client.query<{ plan_id: string; version: number; entitlements: Record<string, unknown> }>(
      `select plan_id, version, entitlements
       from plan_definitions
       where plan_id = $1
       order by version desc
       limit 1`,
      ["development"],
    );
    if (planResult.rows.length === 0) {
      await client.query(
        `insert into plan_definitions (plan_id, version, status, entitlements, effective_from)
         values ($1, 1, 'active', $2::jsonb, now())
         on conflict (plan_id, version) do nothing`,
        [
          "development",
          JSON.stringify({
            online_payments: true,
            printing: true,
            catalog_management: true,
            max_locations: 3,
          }),
        ],
      );
    }

    const plan = planResult.rows[0] ?? { plan_id: "development", version: 1, entitlements: {} };
    await client.query(
      `insert into tenant_entitlement_snapshots
        (tenant_id, plan_id, plan_version, entitlements, source_request_id, effective_at)
       values ($1, $2, $3, $4::jsonb, 'dev-seed', now())
       on conflict (id) do nothing`,
      [resolvedTenantId, plan.plan_id, plan.version, JSON.stringify(plan.entitlements)],
    );

    await client.query(
      `insert into catalog_categories
        (id, tenant_id, name, normalized_name, description, sort_order, status)
       select $1, $2, 'Hamburguesas', 'hamburguesas', 'Hamburguesas clasicas', 0, 'active'
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

    const categoryResult = await client.query<{ id: string }>(
      `select id from catalog_categories
       where tenant_id = $1 and normalized_name = 'hamburguesas' and archived_at is null
       limit 1`,
      [resolvedTenantId],
    );
    const categoryId = categoryResult.rows[0]?.id;
    if (!categoryId) throw new Error("Could not create category.");

    await client.query(
      `insert into catalog_categories
        (id, tenant_id, name, normalized_name, description, sort_order, status)
       select $1, $2, 'Bebidas', 'bebidas', 'Bebidas y refrescos', 1, 'active'
       where not exists (
        select 1 from catalog_categories
        where tenant_id = $2 and normalized_name = 'bebidas' and archived_at is null
       )`,
      [randomUUID(), resolvedTenantId],
    );

    const items = [
      {
        id: DEFAULT_ITEM_ONE_ID,
        name: "Burger clasica",
        normalizedName: "burger-clasica",
        description: "Medallon de carne 150g, queso cheddar, lechuga, tomate y salsa de la casa.",
        price: "6900.00",
        sortOrder: 0,
      },
      {
        id: DEFAULT_ITEM_TWO_ID,
        name: "Papas cheddar",
        normalizedName: "papas-cheddar",
        description: "Papas fritas con cheddar y verdeo picado.",
        price: "4200.00",
        sortOrder: 1,
      },
      {
        id: randomUUID(),
        name: "Coca-Cola 500ml",
        normalizedName: "coca-cola-500ml",
        description: "Gaseosa sabor original 500ml.",
        price: "2200.00",
        sortOrder: 0,
        categoryIndex: 1,
      },
    ];

    for (const item of items) {
      const catId = (item as { categoryIndex?: number }).categoryIndex === 1
        ? (await client.query<{ id: string }>(
            `select id from catalog_categories
             where tenant_id = $1 and normalized_name = 'bebidas' and archived_at is null
             limit 1`,
            [resolvedTenantId],
          )).rows[0]?.id ?? categoryId
        : categoryId;

      await client.query(
        `insert into catalog_items
          (id, tenant_id, category_id, name, normalized_name, description, price, currency, status, sort_order)
         select $1, $2, $3, $4, $5, $6, $7, 'ARS', 'active', $8
         where not exists (
          select 1 from catalog_items
          where tenant_id = $2 and normalized_name = $5 and archived_at is null
         )`,
        [item.id, resolvedTenantId, catId, item.name, item.normalizedName, item.description, item.price, item.sortOrder],
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
        `\nDev tenant ready:`,
        `  Tenant:   ${tenantName} (${slug})`,
        `  Tenant ID: ${resolvedTenantId}`,
        `  Owner:    ${ownerEmail} / ${ownerPassword}`,
        `  Admin:    http://localhost:3000/admin/${resolvedTenantId}`,
        `  Storefront header: x-komanda-tenant-slug: ${slug}`,
        `  Storefront URL:    http://localhost:3000/order`,
        `  Catalog:  3 items in 2 categories`,
        `\nLogin en /admin con email=${ownerEmail} password=${ownerPassword}\n`,
      ].join("\n"),
    );
  } catch (error) {
    await client.query("rollback");
    if (isMissingRelation(error)) {
      throw new Error(
        "Database is not migrated. Run: cd src && npm run db:migrate",
      );
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
