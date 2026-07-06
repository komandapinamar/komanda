import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

describe("multi-tenant foundation migration", () => {
  it("declares default-deny FORCE RLS and a non-bypass runtime role", async () => {
    const migration = await readFile(
      resolve(process.cwd(), "drizzle/0003_multitenant_platform_expand.sql"),
      "utf8",
    );
    expect(migration).toContain("komanda_runtime");
    expect(migration).toContain("NOBYPASSRLS");
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)?.length).toBeGreaterThanOrEqual(8);
    expect(migration).toContain("current_setting('app.tenant_id', true)");
  });

  const integrationEnabled = process.env.DATABASE_TEST_INTEGRATION === "1";
  const databaseTest = integrationEnabled ? it : it.skip;

  databaseTest(
    "fails closed without context and isolates known tenant ids with the runtime role",
    async () => {
      const ownerUrl = process.env.DATABASE_DIRECT_URL;
      const runtimeUrl = process.env.DATABASE_URL;
      if (!ownerUrl || !runtimeUrl) throw new Error("Test database URLs are required.");
      const owner = new Pool({ connectionString: ownerUrl });
      const runtime = new Pool({ connectionString: runtimeUrl });
      const tenantA = "00000000-0000-4000-8000-00000000000a";
      const tenantB = "00000000-0000-4000-8000-00000000000b";
      try {
        await owner.query(
          `insert into tenants (id, name, slug, normalized_slug)
           values ($1, 'Tenant A', 'tenant-a', 'tenant-a'),
                  ($2, 'Tenant B', 'tenant-b', 'tenant-b')
           on conflict (id) do nothing`,
          [tenantA, tenantB],
        );
        const noContext = await runtime.query("select id from tenants");
        expect(noContext.rows).toHaveLength(0);

        const client = await runtime.connect();
        try {
          await client.query("begin");
          await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
          const scoped = await client.query("select id from tenants order by id");
          expect(scoped.rows).toEqual([{ id: tenantA }]);
          await expect(
            client.query(
              "insert into tenant_locations (tenant_id, name, timezone, is_primary) values ($1, 'Foreign', 'UTC', false)",
              [tenantB],
            ),
          ).rejects.toThrow();
          await client.query("rollback");
        } finally {
          client.release();
        }

        const role = await runtime.query(
          "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
        );
        expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
        const ownership = await runtime.query(
          "select count(*)::int as count from pg_tables where tablename = 'tenants' and tableowner = current_user",
        );
        expect(ownership.rows[0]).toEqual({ count: 0 });
      } finally {
        await Promise.all([owner.end(), runtime.end()]);
      }
    },
    30_000,
  );
});
