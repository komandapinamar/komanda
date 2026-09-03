import { Pool } from "pg";

type RoleAudit = {
  current_user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
};

export const EXPECTED_PROTECTED_TABLES = [
  "addon_groups",
  "addon_options",
  "audit_events",
  "billing_documents",
  "cart_line_options",
  "cart_lines",
  "carts",
  "catalog_categories",
  "catalog_combos",
  "catalog_items",
  "combo_items",
  "idempotency_records",
  "identity_verification_challenges",
  "integration_accounts",
  "item_addon_groups",
  "media_assets",
  "onboarding_handoffs",
  "order_events",
  "order_line_options",
  "order_lines",
  "orders",
  "outbox_events",
  "payment_attempts",
  "print_agents",
  "print_job_attempts",
  "print_jobs",
  "provider_resource_routes",
  "storefront_sessions",
  "tenant_counters",
  "tenant_entitlement_snapshots",
  "tenant_locations",
  "tenant_memberships",
  "tenant_settings",
  "tenants",
  "user_sessions",
  "users",
  "webhook_events",
] as const;

export const REQUIRED_TENANT_NOT_NULL_TABLES = [
  "addon_groups",
  "addon_options",
  "billing_documents",
  "cart_line_options",
  "cart_lines",
  "carts",
  "catalog_categories",
  "catalog_combos",
  "catalog_items",
  "combo_items",
  "integration_accounts",
  "item_addon_groups",
  "media_assets",
  "onboarding_handoffs",
  "order_events",
  "order_line_options",
  "order_lines",
  "orders",
  "outbox_events",
  "payment_attempts",
  "print_agents",
  "print_job_attempts",
  "print_jobs",
  "provider_resource_routes",
  "storefront_sessions",
  "tenant_counters",
  "tenant_entitlement_snapshots",
  "tenant_locations",
  "tenant_memberships",
  "tenant_settings",
  "webhook_events",
] as const;

async function inspect(connectionString: string) {
  const pool = new Pool({ connectionString });
  try {
    const role = await pool.query<RoleAudit>(
      "select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    const tables = await pool.query<{
      tablename: string;
      tableowner: string;
      rowsecurity: boolean;
      forcerowsecurity: boolean;
    }>(`
      select c.relname as tablename,
             pg_get_userbyid(c.relowner) as tableowner,
             c.relrowsecurity as rowsecurity,
             c.relforcerowsecurity as forcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname = any($1::text[])
      order by c.relname
    `, [EXPECTED_PROTECTED_TABLES]);
    const maintenancePolicies = await pool.query<{ tablename: string }>(
      `select tablename
       from pg_policies
       where schemaname = 'public'
         and tablename = any($1::text[])
         and 'komanda_migration'::name = any(roles)
       order by tablename`,
      [EXPECTED_PROTECTED_TABLES],
    );
    const tenantColumns = await pool.query<{
      tablename: string;
      is_nullable: "YES" | "NO";
    }>(
      `select table_name as tablename, is_nullable
       from information_schema.columns
       where table_schema = 'public'
         and column_name = 'tenant_id'
         and table_name = any($1::text[])
       order by table_name`,
      [REQUIRED_TENANT_NOT_NULL_TABLES],
    );
    const unvalidatedConstraints = await pool.query<{
      tablename: string;
      constraint_name: string;
    }>(`
      select c.conrelid::regclass::text as tablename,
             c.conname as constraint_name
      from pg_constraint c
      join pg_class relation on relation.oid = c.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and not c.convalidated
      order by c.conrelid::regclass::text, c.conname
    `);
    return {
      role: role.rows[0],
      tables: tables.rows,
      maintenancePolicies: maintenancePolicies.rows,
      tenantColumns: tenantColumns.rows,
      unvalidatedConstraints: unvalidatedConstraints.rows,
    };
  } finally {
    await pool.end();
  }
}

export async function verifyDatabaseRoles(input?: {
  runtimeUrl?: string;
  migrationUrl?: string;
}) {
  const runtimeUrl = input?.runtimeUrl ?? process.env.DATABASE_URL;
  const migrationUrl = input?.migrationUrl ?? process.env.DATABASE_DIRECT_URL;
  if (!runtimeUrl || !migrationUrl) {
    throw new Error("DATABASE_URL and DATABASE_DIRECT_URL are both required.");
  }
  if (runtimeUrl === migrationUrl && process.env.NODE_ENV !== "test") {
    throw new Error("Runtime and migration database URLs must use distinct roles.");
  }

  const [runtime, migration] = await Promise.all([
    inspect(runtimeUrl),
    inspect(migrationUrl),
  ]);
  if (!runtime.role || runtime.role.rolsuper || runtime.role.rolbypassrls) {
    throw new Error("Runtime role must exist without SUPERUSER or BYPASSRLS.");
  }
  const actualTableNames = new Set(runtime.tables.map((table) => table.tablename));
  const missingTables = EXPECTED_PROTECTED_TABLES.filter(
    (table) => !actualTableNames.has(table),
  );
  if (
    missingTables.length > 0 ||
    runtime.tables.length !== EXPECTED_PROTECTED_TABLES.length
  ) {
    throw new Error(
      `Protected table inventory mismatch. Missing: ${missingTables.join(", ") || "none"}.`,
    );
  }
  const unsafeTables = runtime.tables.filter(
    (table) =>
      !table.rowsecurity ||
      !table.forcerowsecurity ||
      table.tableowner === runtime.role.current_user,
  );
  if (unsafeTables.length > 0) {
    throw new Error(
      `Unsafe runtime table ownership/RLS: ${unsafeTables
        .map((table) => table.tablename)
        .join(", ")}`,
    );
  }
  const tenantColumns = new Map(
    runtime.tenantColumns.map((column) => [column.tablename, column]),
  );
  const missingTenantColumns = REQUIRED_TENANT_NOT_NULL_TABLES.filter(
    (table) => !tenantColumns.has(table),
  );
  const nullableTenantColumns = runtime.tenantColumns.filter(
    (column) => column.is_nullable !== "NO",
  );
  if (missingTenantColumns.length > 0 || nullableTenantColumns.length > 0) {
    throw new Error(
      `Tenant ownership contract is incomplete. Missing tenant_id: ${
        missingTenantColumns.join(", ") || "none"
      }; nullable tenant_id: ${
        nullableTenantColumns.map((column) => column.tablename).join(", ") || "none"
      }.`,
    );
  }
  if (runtime.unvalidatedConstraints.length > 0) {
    throw new Error(
      `Unvalidated public constraints: ${runtime.unvalidatedConstraints
        .map(
          (constraint) =>
            `${constraint.tablename}.${constraint.constraint_name}`,
        )
        .join(", ")}`,
    );
  }
  if (migration.role?.current_user === runtime.role.current_user) {
    throw new Error("Runtime and migration connections resolve to the same role.");
  }
  const maintenanceTableNames = new Set(
    migration.maintenancePolicies.map(({ tablename }) => tablename),
  );
  const missingMaintenancePolicies = EXPECTED_PROTECTED_TABLES.filter(
    (table) => !maintenanceTableNames.has(table),
  );
  if (missingMaintenancePolicies.length > 0) {
    throw new Error(
      `Missing komanda_migration RLS policies: ${missingMaintenancePolicies.join(", ")}`,
    );
  }
  return { runtime, migration };
}

async function main() {
  await verifyDatabaseRoles();
  process.stdout.write("Database role and FORCE RLS verification passed.\n");
}

if (process.argv[1]?.endsWith("verify-database-roles.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Database role verification failed."}\n`,
    );
    process.exitCode = 1;
  });
}
