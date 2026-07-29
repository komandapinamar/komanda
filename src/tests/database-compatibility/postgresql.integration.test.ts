import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { EXPECTED_PROTECTED_TABLES } from "@/scripts/verify-database-roles";

const databaseTest = process.env.DATABASE_TEST_INTEGRATION === "1" ? it : it.skip;

const tenantTables = EXPECTED_PROTECTED_TABLES;

describe("PostgreSQL 17 provider compatibility", () => {
  it("uses the provider-neutral node-postgres runtime adapter", async () => {
    const source = await readFile("db/index.ts", "utf8");
    expect(source).toContain('from "pg"');
    expect(source).toContain('from "drizzle-orm/node-postgres"');
    expect(source).not.toContain("@neondatabase/serverless");
    expect(source).not.toContain("neon-serverless");
  });

  databaseTest("preserves role, RLS and tenant idempotency invariants", async () => {
    const directUrl = process.env.DATABASE_DIRECT_URL;
    const runtimeUrl = process.env.DATABASE_URL;
    if (!directUrl || !runtimeUrl) {
      throw new Error("DATABASE_DIRECT_URL and DATABASE_URL are required.");
    }

    const owner = new Pool({ connectionString: directUrl, max: 1 });
    const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
    const tenantId = randomUUID();
    const secondTenantId = randomUUID();
    const idempotencyKey = `compatibility-${randomUUID()}`;
    const sharedIdempotencyKey = `shared-${randomUUID()}`;

    try {
      const version = await owner.query<{ server_version_num: string }>(
        "show server_version_num",
      );
      const versionNumber = Number(version.rows[0]?.server_version_num);
      expect(versionNumber).toBeGreaterThanOrEqual(170_000);
      expect(versionNumber).toBeLessThan(180_000);

      const runtimeRole = await runtime.query<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        "select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user",
      );
      expect(runtimeRole.rows[0]).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
      });

      const policies = await owner.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
        owner_is_runtime: boolean;
      }>(`
        select c.relname,
               c.relrowsecurity,
               c.relforcerowsecurity,
               pg_get_userbyid(c.relowner) = $1 as owner_is_runtime
        from pg_class c
        where c.relkind = 'r' and c.relname = any($2::text[])
        order by c.relname
      `, [runtimeRole.rows[0]!.current_user, tenantTables]);
      expect(policies.rows).toHaveLength(tenantTables.length);
      expect(policies.rows.map(({ relname }) => relname)).toEqual(
        [...tenantTables].sort(),
      );
      expect(
        policies.rows.every(
          (table) =>
            table.relrowsecurity &&
            table.relforcerowsecurity &&
            !table.owner_is_runtime,
        ),
      ).toBe(true);

      const withoutContext = await runtime.query("select id from tenants");
      expect(withoutContext.rows).toHaveLength(0);

      await owner.query(
        `insert into tenants (id, name, slug, normalized_slug)
         values ($1, 'Compatibility Tenant', $2, $2),
                ($3, 'Second Compatibility Tenant', $4, $4)`,
        [
          tenantId,
          `compatibility-${tenantId}`,
          secondTenantId,
          `compatibility-${secondTenantId}`,
        ],
      );

      await owner.query(
        `insert into idempotency_records
           (tenant_id, scope, idempotency_key, request_hash, state, locked_until, expires_at)
         values ($1, 'cross-tenant', $3, 'first', 'processing', now() + interval '30 seconds', now() + interval '1 minute'),
                ($2, 'cross-tenant', $3, 'second', 'processing', now() + interval '30 seconds', now() + interval '1 minute')`,
        [tenantId, secondTenantId, sharedIdempotencyKey],
      );

      const client = await runtime.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('app.tenant_id', $1, true)", [
          tenantId,
        ]);
        const values = [
          tenantId,
          "database-compatibility",
          idempotencyKey,
          "request-hash",
          "processing",
          new Date(Date.now() + 30_000),
          new Date(Date.now() + 60_000),
        ];
        await client.query(
          `insert into idempotency_records
             (tenant_id, scope, idempotency_key, request_hash, state, locked_until, expires_at)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          values,
        );
        await expect(
          client.query(
            `insert into idempotency_records
               (tenant_id, scope, idempotency_key, request_hash, state, locked_until, expires_at)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            values,
          ),
        ).rejects.toMatchObject({ code: "23505" });
        await client.query("rollback");
      } finally {
        client.release();
      }
    } finally {
      await owner
        .query("delete from idempotency_records where tenant_id = any($1::uuid[])", [
          [tenantId, secondTenantId],
        ])
        .catch(() => undefined);
      await owner
        .query("delete from tenants where id = any($1::uuid[])", [
          [tenantId, secondTenantId],
        ])
        .catch(() => undefined);
      await Promise.all([owner.end(), runtime.end()]);
    }
  });
});
