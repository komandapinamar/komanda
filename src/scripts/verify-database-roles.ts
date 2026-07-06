import { Pool } from "pg";

type RoleAudit = {
  current_user: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
};

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
      where c.relname in ('tenants', 'tenant_locations', 'tenant_memberships', 'tenant_settings', 'tenant_counters', 'outbox_events', 'idempotency_records', 'audit_events')
      order by c.relname
    `);
    return { role: role.rows[0], tables: tables.rows };
  } finally {
    await pool.end();
  }
}

async function main() {
  const runtimeUrl = process.env.DATABASE_URL;
  const migrationUrl = process.env.DATABASE_DIRECT_URL;
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
  if (migration.role?.current_user === runtime.role.current_user) {
    throw new Error("Runtime and migration connections resolve to the same role.");
  }
  process.stdout.write("Database role and FORCE RLS verification passed.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Database role verification failed."}\n`,
  );
  process.exitCode = 1;
});
