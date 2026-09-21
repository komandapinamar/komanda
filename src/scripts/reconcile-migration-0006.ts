import "dotenv/config";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool, type PoolClient } from "pg";

const migrationTimestamp = 1_788_440_000_000;
const expectedMigrationHash =
  "8fa773e8d933777a634122160c3501a25de78fdae673ed0f66116fdfb4d7c5af";
const migrationTag = "0006_add_print_pairings";

type Column = {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

type ExpectedColumn = Pick<Column, "data_type" | "is_nullable"> & {
  defaultIncludes: string | null;
};

const expectedColumns: Record<string, ExpectedColumn> = {
  id: { data_type: "uuid", is_nullable: "NO", defaultIncludes: "gen_random_uuid" },
  tenant_id: { data_type: "uuid", is_nullable: "NO", defaultIncludes: null },
  location_id: { data_type: "uuid", is_nullable: "NO", defaultIncludes: null },
  code_digest: { data_type: "text", is_nullable: "NO", defaultIncludes: null },
  status: { data_type: "text", is_nullable: "NO", defaultIncludes: "pending" },
  attempts: { data_type: "integer", is_nullable: "NO", defaultIncludes: "0" },
  expires_at: {
    data_type: "timestamp with time zone",
    is_nullable: "NO",
    defaultIncludes: null,
  },
  claimed_agent_id: { data_type: "uuid", is_nullable: "YES", defaultIncludes: null },
  created_at: {
    data_type: "timestamp with time zone",
    is_nullable: "NO",
    defaultIncludes: "now()",
  },
  updated_at: {
    data_type: "timestamp with time zone",
    is_nullable: "NO",
    defaultIncludes: "now()",
  },
};

const expectedBaseConstraints = new Set([
  "print_agent_pairings_pkey",
  "print_pairings_tenant_id_id_key",
  "print_pairings_status_check",
  "print_pairings_attempts_check",
]);

function fail(message: string): never {
  throw new Error(`Cannot reconcile ${migrationTag}: ${message}`);
}

async function assertSourceIntegrity() {
  const migration = readMigrationFiles({ migrationsFolder: "./drizzle" }).find(
    ({ folderMillis }) => folderMillis === migrationTimestamp,
  );

  if (!migration || migration.hash !== expectedMigrationHash) {
    fail("the local migration source no longer has its released hash");
  }
}

async function assertPartialState(client: PoolClient) {
  const [identity, journal, columns, constraints, rowCount] = await Promise.all([
    client.query<{ current_user: string }>("select current_user"),
    client.query<{ hash: string; created_at: string }>(
      `select hash, created_at::text
       from drizzle.__drizzle_migrations
       where created_at >= $1
       order by created_at`,
      [migrationTimestamp],
    ),
    client.query<Column>(
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = 'print_agent_pairings'
       order by ordinal_position`,
    ),
    client.query<{ conname: string }>(
      `select conname
       from pg_constraint
       where conrelid = 'public.print_agent_pairings'::regclass
       order by conname`,
    ),
    client.query<{ total: number }>(
      "select count(*)::int as total from public.print_agent_pairings",
    ),
  ]);

  if (identity.rows[0]?.current_user !== "komanda_migration") {
    fail("DATABASE_DIRECT_URL must authenticate as komanda_migration");
  }

  if (journal.rows.length > 0) {
    fail("the migration journal already contains migration 0006 or a later entry");
  }

  if (rowCount.rows[0]?.total !== 0) {
    fail("print_agent_pairings is not empty");
  }

  if (columns.rows.length !== Object.keys(expectedColumns).length) {
    fail("print_agent_pairings does not have the expected base column set");
  }

  for (const column of columns.rows) {
    const expected = expectedColumns[column.column_name];
    if (
      !expected ||
      expected.data_type !== column.data_type ||
      expected.is_nullable !== column.is_nullable ||
      (expected.defaultIncludes === null
        ? column.column_default !== null
        : !column.column_default?.includes(expected.defaultIncludes))
    ) {
      fail(`unexpected column definition for ${column.column_name}`);
    }
  }

  const actualConstraints = new Set(constraints.rows.map(({ conname }) => conname));
  if (
    actualConstraints.size !== expectedBaseConstraints.size ||
    [...expectedBaseConstraints].some((name) => !actualConstraints.has(name))
  ) {
    fail("print_agent_pairings does not have the expected base constraints");
  }
}

async function reconcile(client: PoolClient) {
  await client.query("begin");

  try {
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext('komanda:migration:0006'))");
    await assertPartialState(client);

    await client.query(`
      do $$ begin
        if not exists (select 1 from pg_constraint where conname = 'print_pairings_tenant_fk') then
          alter table public.print_agent_pairings
            add constraint print_pairings_tenant_fk
            foreign key (tenant_id) references public.tenants(id) on delete restrict;
        end if;
        if not exists (select 1 from pg_constraint where conname = 'print_pairings_location_fk') then
          alter table public.print_agent_pairings
            add constraint print_pairings_location_fk
            foreign key (tenant_id, location_id)
            references public.tenant_locations(tenant_id, id) on delete restrict;
        end if;
        if not exists (select 1 from pg_constraint where conname = 'print_pairings_agent_fk') then
          alter table public.print_agent_pairings
            add constraint print_pairings_agent_fk
            foreign key (tenant_id, claimed_agent_id)
            references public.print_agents(tenant_id, id) on delete restrict;
        end if;
      end $$;
    `);
    await client.query(
      "create unique index if not exists print_pairings_code_digest_uidx on public.print_agent_pairings (code_digest)",
    );
    await client.query(
      "create index if not exists print_pairings_tenant_location_status_idx on public.print_agent_pairings (tenant_id, location_id, status)",
    );
    await client.query("alter table public.print_agent_pairings enable row level security");
    await client.query("alter table public.print_agent_pairings force row level security");

    await client.query(
      'drop policy if exists "print_pairings_runtime_isolation" on public.print_agent_pairings',
    );
    await client.query(`
      create policy "print_pairings_runtime_isolation" on public.print_agent_pairings
      to komanda_runtime
      using (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        or nullif(current_setting('app.service_id', true), '') = 'print-pairing'
      )
      with check (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        or nullif(current_setting('app.service_id', true), '') = 'print-pairing'
      )
    `);
    await client.query(
      'drop policy if exists "print_pairings_migration_maintenance" on public.print_agent_pairings',
    );
    await client.query(`
      create policy "print_pairings_migration_maintenance" on public.print_agent_pairings
      to komanda_migration using (true) with check (true)
    `);

    await client.query(
      'drop policy if exists "print_agents_runtime_isolation" on public.print_agents',
    );
    await client.query(`
      create policy "print_agents_runtime_isolation" on public.print_agents
      to komanda_runtime
      using (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        or nullif(current_setting('app.service_id', true), '') in ('print-agent-auth', 'print-pairing')
      )
      with check (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        or nullif(current_setting('app.service_id', true), '') = 'print-pairing'
      )
    `);
    await client.query(
      'drop policy if exists "tenant_locations_runtime_isolation" on public.tenant_locations',
    );
    await client.query(`
      create policy "tenant_locations_runtime_isolation" on public.tenant_locations
      to komanda_runtime
      using (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        or nullif(current_setting('app.service_id', true), '') = 'print-pairing'
      )
      with check (
        tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
        or nullif(current_setting('app.service_id', true), '') = 'print-pairing'
      )
    `);

    await client.query(
      `insert into drizzle.__drizzle_migrations (hash, created_at)
       values ($1, $2)`,
      [expectedMigrationHash, migrationTimestamp],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL;
  if (!connectionString) fail("DATABASE_DIRECT_URL is required");

  if (process.argv.slice(2).some((argument) => argument !== "--apply")) {
    fail("only --apply is supported");
  }

  await assertSourceIntegrity();
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: { rejectUnauthorized: true },
  });
  const client = await pool.connect();

  try {
    await client.query("begin");
    try {
      await client.query("select pg_advisory_xact_lock(hashtext('komanda:migration:0006'))");
      await assertPartialState(client);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    }
    await client.query("rollback");

    if (!process.argv.includes("--apply")) {
      process.stdout.write(`${migrationTag} preflight passed; rerun with --apply to reconcile.\n`);
      return;
    }

    await reconcile(client);
    process.stdout.write(`${migrationTag} reconciled and journaled.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Migration reconciliation failed."}\n`);
  process.exitCode = 1;
});
