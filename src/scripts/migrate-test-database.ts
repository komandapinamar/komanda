import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { EXPECTED_PROTECTED_TABLES } from "./verify-database-roles";

async function main() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The test migration command requires NODE_ENV=test.");
  }
  const connectionString = process.env.DATABASE_DIRECT_URL;
  if (!connectionString) throw new Error("DATABASE_DIRECT_URL is required.");

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`
      do $setup$
      begin
        if not exists (select 1 from pg_roles where rolname = 'komanda_runtime') then
          create role komanda_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
        end if;
      end
      $setup$
    `);
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });

    const migratedTables = await client.query<{ tablename: string }>(
      `select tablename
       from pg_tables
       where schemaname = 'public' and tablename = any($1::text[])
       order by tablename`,
      [EXPECTED_PROTECTED_TABLES],
    );
    if (migratedTables.rows.length !== EXPECTED_PROTECTED_TABLES.length) {
      const actual = new Set(migratedTables.rows.map(({ tablename }) => tablename));
      const missing = EXPECTED_PROTECTED_TABLES.filter((table) => !actual.has(table));
      throw new Error(`Migration completed with missing protected tables: ${missing.join(", ")}`);
    }

    const runtimeUser = process.env.DATABASE_RUNTIME_TEST_USER;
    const runtimePassword = process.env.DATABASE_RUNTIME_TEST_PASSWORD;
    if (runtimeUser && runtimePassword) {
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeUser)) {
        throw new Error("Invalid test runtime role name.");
      }
      await client.query(
        `do $setup$ begin
         if not exists (select 1 from pg_roles where rolname = '${runtimeUser}') then
           create role ${runtimeUser} login password '${runtimePassword.replaceAll("'", "''")}' nosuperuser nocreatedb nocreaterole inherit nobypassrls;
         end if;
       end $setup$`,
      );
      await client.query(`grant komanda_runtime to ${runtimeUser}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
