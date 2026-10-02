import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import {
  MemberService,
  UserAlreadyMemberError,
} from "@/features/members/application/member.service";import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

// S01: adding a member to tenant B must never touch an identity that already
// exists globally. This test runs against real PostgreSQL with the real
// `komanda_runtime` role and real FORCE RLS, because the defect is only
// observable when the platform identity lookup and the tenant membership write
// actually happen inside one transaction.
describe("member invitation identity isolation", () => {
  const integrationEnabled = process.env.DATABASE_TEST_INTEGRATION === "1";
  const databaseTest = integrationEnabled ? it : it.skip;

  databaseTest(
    "does not let one tenant reset the credentials of an identity owned by another",
    async () => {
      const ownerUrl = process.env.DATABASE_DIRECT_URL;
      const runtimeUrl = process.env.DATABASE_URL;
      if (!ownerUrl || !runtimeUrl) throw new Error("Test database URLs are required.");

      const tenantA = "00000000-0000-4000-8000-0000000000a1";
      const tenantB = "00000000-0000-4000-8000-0000000000b1";
      const sharedEmail = `shared-${Date.now()}@example.test`;
      const normalizedSharedEmail = sharedEmail.toLowerCase();
      const ownerPassword = "owner-password-original";
      const attackerPassword = "attacker-password-chosen";

      const owner = new Pool({ connectionString: ownerUrl });
      const runtime = new Pool({ connectionString: runtimeUrl });

      try {
        // Seed as the migration owner: the runtime role may never create
        // tenants or identities outside a transaction context.
        await owner.query(
          `insert into tenants (id, name, slug, normalized_slug)
           values ($1, 'Tenant A', 'tenant-a-identity', 'tenant-a-identity'),
                  ($2, 'Tenant B', 'tenant-b-identity', 'tenant-b-identity')
           on conflict (id) do nothing`,
          [tenantA, tenantB],
        );

        const victimHash = await bcrypt.hash(ownerPassword, 4);
        const victim = await owner.query<{ id: string }>(
          `insert into users (email, normalized_email, password_hash, status, email_verified_at)
           values ($1, $2, $3, 'active', now())
           returning id`,
          [sharedEmail, normalizedSharedEmail, victimHash],
        );
        const victimId = victim.rows[0].id;

        await owner.query(
          `insert into tenant_memberships (tenant_id, user_id, role, status)
           values ($1, $2, 'owner', 'active')`,
          [tenantB, victimId],
        );

        // A tenant-A owner invents the tenant-A owner's own context and then
        // invites the tenant-B owner into tenant A.
        const attacker = await owner.query<{ id: string }>(
          `insert into users (email, normalized_email, password_hash, status, email_verified_at)
           values ($1, $2, $3, 'active', now())
           returning id`,
          [
            `attacker-${Date.now()}@example.test`,
            `attacker-${Date.now()}@example.test`,
            await bcrypt.hash("attacker-own-password", 4),
          ],
        );
        const attackerId = attacker.rows[0].id;
        await owner.query(
          `insert into tenant_memberships (tenant_id, user_id, role, status)
           values ($1, $2, 'owner', 'active')`,
          [tenantA, attackerId],
        );

        const context = createVerifiedTenantContext({
          tenantId: tenantA,
          correlationId: "00000000-0000-4000-8000-0000000000f1",
          source: "administrative",
          actor: {
            kind: "user",
            userId: attackerId,
            membershipId: "00000000-0000-4000-8000-0000000000c1",
            role: "owner",
          },
        });

        const before = await owner.query<{
          password_hash: string;
          status: string;
          email_verified_at: Date | null;
          password_plain: string | null;
        }>(
          `select password_hash, status, email_verified_at, password_plain
             from users where id = $1`,
          [victimId],
        );
        expect(before.rows[0].password_hash).toBe(victimHash);
        expect(before.rows[0].password_plain).toBeNull();

        const member = await new MemberService().addMember(context, {
          email: sharedEmail,
          password: attackerPassword,
          role: "employee",
        });

        // A membership exists for the invited identity...
        expect(member).not.toHaveProperty("password");
        expect(member.email).toBe(sharedEmail);
        expect(member.role).toBe("employee");

        const memberships = await owner.query<{ tenant_id: string }>(
          `select tenant_id from tenant_memberships
            where user_id = $1 and status = 'active' order by tenant_id`,
          [victimId],
        );
        expect(memberships.rows.map((row) => row.tenant_id)).toEqual(
          expect.arrayContaining([tenantA, tenantB]),
        );

        // ...but the identity itself is byte-for-byte unchanged.
        const after = await owner.query<{
          password_hash: string;
          status: string;
          email_verified_at: Date | null;
          password_plain: string | null;
        }>(
          `select password_hash, status, email_verified_at, password_plain
             from users where id = $1`,
          [victimId],
        );
        expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
        expect(after.rows[0].status).toBe(before.rows[0].status);
        expect(after.rows[0].email_verified_at).toEqual(
          before.rows[0].email_verified_at,
        );
        expect(after.rows[0].password_plain).toBeNull();

        // The victim's original password still authenticates, and the password
        // the attacker submitted does not. Read through the runtime role under a
        // platform service identity, exactly like the member service does.
        const runtimeReader = await runtime.connect();
        try {
          const noContext = await runtimeReader.query(
            "select id from users where id = $1",
            [victimId],
          );
          expect(noContext.rows).toHaveLength(0);

          await runtimeReader.query("begin");
          await runtimeReader.query(
            "select set_config('app.service_id', 'member-identity-test', true)",
          );
          const stored = await runtimeReader.query<{ password_hash: string }>(
            "select password_hash from users where id = $1",
            [victimId],
          );
          const storedHash = stored.rows[0].password_hash;
          expect(await bcrypt.compare(ownerPassword, storedHash)).toBe(true);
          expect(await bcrypt.compare(attackerPassword, storedHash)).toBe(false);
          await runtimeReader.query("rollback");
        } finally {
          runtimeReader.release();
        }

        // Inviting the same identity into the same tenant again is rejected and
        // leaves the identity untouched.
        await expect(
          new MemberService().addMember(context, {
            email: sharedEmail,
            password: attackerPassword,
            role: "admin",
          }),
        ).rejects.toBeInstanceOf(UserAlreadyMemberError);

        const afterConflict = await owner.query<{
          password_hash: string;
          password_plain: string | null;
        }>(
          "select password_hash, password_plain from users where id = $1",
          [victimId],
        );
        expect(afterConflict.rows[0].password_hash).toBe(victimHash);
        expect(afterConflict.rows[0].password_plain).toBeNull();
      } finally {
        await Promise.all([owner.end(), runtime.end()]);
      }
    },
    60_000,
  );

  databaseTest(
    "creates a fresh identity with only a bcrypt digest and never stores plaintext",
    async () => {
      const ownerUrl = process.env.DATABASE_DIRECT_URL;
      const runtimeUrl = process.env.DATABASE_URL;
      if (!ownerUrl || !runtimeUrl) throw new Error("Test database URLs are required.");

      const tenant = "00000000-0000-4000-8000-0000000000d1";
      const email = `fresh-${Date.now()}@example.test`;
      const password = "fresh-member-password";

      const owner = new Pool({ connectionString: ownerUrl });
      const runtime = new Pool({ connectionString: runtimeUrl });

      try {
        await owner.query(
          `insert into tenants (id, name, slug, normalized_slug)
           values ($1, 'Tenant D', 'tenant-d-fresh', 'tenant-d-fresh')
           on conflict (id) do nothing`,
          [tenant],
        );
        const ownerUser = await owner.query<{ id: string }>(
          `insert into users (email, normalized_email, password_hash, status, email_verified_at)
           values ($1, $2, $3, 'active', now())
           returning id`,
          [
            `owner-d-${Date.now()}@example.test`,
            `owner-d-${Date.now()}@example.test`,
            await bcrypt.hash("owner-d-password", 4),
          ],
        );
        const ownerUserId = ownerUser.rows[0].id;
        await owner.query(
          `insert into tenant_memberships (tenant_id, user_id, role, status)
           values ($1, $2, 'owner', 'active')`,
          [tenant, ownerUserId],
        );

        const context = createVerifiedTenantContext({
          tenantId: tenant,
          correlationId: "00000000-0000-4000-8000-0000000000f2",
          source: "administrative",
          actor: {
            kind: "user",
            userId: ownerUserId,
            membershipId: "00000000-0000-4000-8000-0000000000e1",
            role: "owner",
          },
        });

        const member = await new MemberService().addMember(context, {
          email,
          password,
          role: "employee",
        });
        expect(member).not.toHaveProperty("password");

        const row = await owner.query<{
          password_hash: string;
          password_plain: string | null;
        }>("select password_hash, password_plain from users where id = $1", [
          (
            await owner.query<{ user_id: string }>(
              "select user_id from tenant_memberships where id = $1",
              [member.id],
            )
          ).rows[0].user_id,
        ]);

        expect(row.rows[0].password_plain).toBeNull();
        expect(row.rows[0].password_hash).not.toContain(password);
        expect(row.rows[0].password_hash).toMatch(/^\$2[aby]\$/);
        expect(await bcrypt.compare(password, row.rows[0].password_hash)).toBe(true);

        // The API surface never returns a credential again.
        const listed = await new MemberService().listMembers(context);
        expect(listed.length).toBeGreaterThan(0);
        for (const entry of listed) {
          expect(entry).not.toHaveProperty("password");
        }
        const serialized = JSON.stringify(listed);
        expect(serialized).not.toContain(password);
      } finally {
        await Promise.all([owner.end(), runtime.end()]);
      }
    },
    60_000,
  );

  // Revoking a membership must never destroy an identity that another tenant
  // still owns. This is not currently a defect: `deleteUserIfUnassigned` only
  // observes the current tenant, but `tenant_memberships_user_id_users_id_fk`
  // is ON DELETE RESTRICT and referential integrity checks ignore RLS, so the
  // database refuses the delete. This test pins that invariant, because losing
  // the foreign key or weakening it to CASCADE would silently turn revoking one
  // membership into deleting somebody else's account.
  databaseTest(
    "keeps an identity that another tenant still owns when a membership is revoked",
    async () => {
      const ownerUrl = process.env.DATABASE_DIRECT_URL;
      if (!ownerUrl) throw new Error("Test database URLs are required.");

      const tenantX = "00000000-0000-4000-8000-0000000000a2";
      const tenantY = "00000000-0000-4000-8000-0000000000b2";
      const stamp = Date.now();
      const sharedEmail = `shared-revoke-${stamp}@example.test`;

      const owner = new Pool({ connectionString: ownerUrl });

      try {
        await owner.query(
          `insert into tenants (id, name, slug, normalized_slug)
           values ($1, 'Tenant X', 'tenant-x-revoke', 'tenant-x-revoke'),
                  ($2, 'Tenant Y', 'tenant-y-revoke', 'tenant-y-revoke')
           on conflict (id) do nothing`,
          [tenantX, tenantY],
        );

        const hash = await bcrypt.hash("shared-revoke-password", 4);
        const identity = await owner.query<{ id: string }>(
          `insert into users (email, normalized_email, password_hash, status, email_verified_at)
           values ($1, $2, $3, 'active', now())
           returning id`,
          [sharedEmail, sharedEmail.toLowerCase(), hash],
        );
        const identityId = identity.rows[0].id;

        const memberships = await owner.query<{ id: string; tenant_id: string }>(
          `insert into tenant_memberships (tenant_id, user_id, role, status)
           values ($1, $2, 'employee', 'active'), ($3, $2, 'owner', 'active')
           returning id, tenant_id`,
          [tenantX, identityId, tenantY],
        );
        const membershipX = memberships.rows.find(
          (row) => row.tenant_id === tenantX,
        );
        const membershipY = memberships.rows.find(
          (row) => row.tenant_id === tenantY,
        );
        if (!membershipX || !membershipY) throw new Error("Seeded memberships missing.");

        // A live session stands in for the identity being used elsewhere: a
        // cascade delete of users would take it away too.
        const session = await owner.query<{ id: string }>(
          `insert into user_sessions (user_id, token_digest, expires_at)
           values ($1, $2, now() + interval '1 hour')
           returning id`,
          [identityId, `digest-revoke-${stamp}`],
        );

        const context = createVerifiedTenantContext({
          tenantId: tenantX,
          correlationId: "00000000-0000-4000-8000-0000000000f3",
          source: "administrative",
          actor: {
            kind: "system",
            process: "member-identity-test",
          },
        });

        await new MemberService().deleteMember(context, {
          membershipId: membershipX.id,
        });

        // The tenant-X membership is gone, the tenant-Y membership survives.
        const remaining = await owner.query<{ tenant_id: string }>(
          `select tenant_id from tenant_memberships
            where user_id = $1 order by tenant_id`,
          [identityId],
        );
        expect(remaining.rows.map((row) => row.tenant_id)).toEqual([
          tenantY,
        ]);

        // The global identity and its sessions are untouched.
        const survivor = await owner.query<{ id: string }>(
          "select id from users where id = $1",
          [identityId],
        );
        expect(survivor.rows).toHaveLength(1);

        const sessions = await owner.query<{ id: string }>(
          "select id from user_sessions where id = $1",
          [session.rows[0].id],
        );
        expect(sessions.rows).toHaveLength(1);

        // Revoking the last remaining membership does clean up the identity.
        await new MemberService().deleteMember(
          createVerifiedTenantContext({
            tenantId: tenantY,
            correlationId: "00000000-0000-4000-8000-0000000000f4",
            source: "administrative",
            actor: { kind: "system", process: "member-identity-test" },
          }),
          { membershipId: membershipY.id },
        );

        const reaped = await owner.query<{ id: string }>(
          "select id from users where id = $1",
          [identityId],
        );
        expect(reaped.rows).toHaveLength(0);
      } finally {
        await owner.end();
      }
    },
    60_000,
  );
});
