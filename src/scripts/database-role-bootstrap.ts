import { Pool, type PoolClient } from "pg";

const RUNTIME_ROLE = "komanda_runtime";

async function configureRuntimeRole(
  client: PoolClient,
  password: string,
) {
  await client.query("select set_config('app.bootstrap_runtime_password', $1, true)", [
    password,
  ]);
  await client.query(`
    do $bootstrap$
    begin
      if not exists (select 1 from pg_roles where rolname = '${RUNTIME_ROLE}') then
        execute format(
          'create role ${RUNTIME_ROLE} login password %L nosuperuser nocreatedb nocreaterole noinherit nobypassrls',
          current_setting('app.bootstrap_runtime_password')
        );
      else
        execute format(
          'alter role ${RUNTIME_ROLE} login password %L nosuperuser nocreatedb nocreaterole noinherit nobypassrls',
          current_setting('app.bootstrap_runtime_password')
        );
      end if;

      -- Provider-managed administrative roles (for example Neon\'s
      -- neon_superuser) cannot necessarily be granted/revoked by the project
      -- owner. Newly created PostgreSQL roles do not inherit those memberships,
      -- and the explicit verification below fails the transaction if an
      -- existing runtime role ever acquired one.
    end
    $bootstrap$;
  `);
}

export async function bootstrapRuntimeRole(input: {
  connectionString: string;
  runtimePassword: string;
}) {
  if (input.runtimePassword.length < 32) {
    throw new Error("DATABASE_RUNTIME_PASSWORD must contain at least 32 characters.");
  }
  const pool = new Pool({
    connectionString: input.connectionString,
    max: 1,
    ssl: input.connectionString.includes("localhost")
      ? undefined
      : { rejectUnauthorized: true },
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await configureRuntimeRole(client, input.runtimePassword);
    const result = await client.query<{
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolbypassrls: boolean;
      inherits_neon_superuser: boolean;
    }>(`
      select role.rolcanlogin,
             role.rolsuper,
             role.rolbypassrls,
             case
               when to_regrole('neon_superuser') is null then false
               else pg_has_role(role.oid, to_regrole('neon_superuser'), 'member')
             end as inherits_neon_superuser
      from pg_roles role
      where role.rolname = '${RUNTIME_ROLE}'
    `);
    const runtime = result.rows[0];
    if (
      !runtime?.rolcanlogin ||
      runtime.rolsuper ||
      runtime.rolbypassrls ||
      runtime.inherits_neon_superuser
    ) {
      throw new Error("Runtime database role failed least-privilege verification.");
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
