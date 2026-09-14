import { readMigrationFiles } from "drizzle-orm/migrator";
import { Pool } from "pg";

type AppliedMigration = {
  hash: string;
  created_at: string;
};

export async function verifyMigrationJournal(input: {
  connectionString: string;
  migrationsFolder?: string;
  requireComplete?: boolean;
}) {
  const migrations = readMigrationFiles({
    migrationsFolder: input.migrationsFolder ?? "./drizzle",
  });
  const pool = new Pool({ connectionString: input.connectionString, max: 1 });

  try {
    const relation = await pool.query<{ journal: string | null }>(
      "select to_regclass('drizzle.__drizzle_migrations')::text as journal",
    );
    const applied = relation.rows[0]?.journal
      ? await pool.query<AppliedMigration>(
          `select hash, created_at::text
           from drizzle.__drizzle_migrations
           order by created_at`,
        )
      : { rows: [] as AppliedMigration[] };

    if (applied.rows.length > migrations.length) {
      throw new Error(
        `Database has ${applied.rows.length} migrations but the source contains ${migrations.length}.`,
      );
    }

    const mismatches = applied.rows.flatMap((remote, index) => {
      const local = migrations[index];
      if (
        local &&
        remote.hash === local.hash &&
        remote.created_at === String(local.folderMillis)
      ) {
        return [];
      }
      return [index];
    });
    if (mismatches.length > 0) {
      throw new Error(
        `Applied migration journal differs from source at indexes: ${mismatches.join(", ")}.`,
      );
    }
    if (input.requireComplete && applied.rows.length !== migrations.length) {
      throw new Error(
        `Migration journal is incomplete: applied ${applied.rows.length} of ${migrations.length}.`,
      );
    }

    return {
      sourceCount: migrations.length,
      appliedCount: applied.rows.length,
      pendingCount: migrations.length - applied.rows.length,
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL;
  if (!connectionString) throw new Error("DATABASE_DIRECT_URL is required.");
  const result = await verifyMigrationJournal({
    connectionString,
    requireComplete: process.env.DATABASE_MIGRATION_REQUIRE_COMPLETE !== "0",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.endsWith("verify-migration-journal.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Migration journal verification failed."}\n`,
    );
    process.exitCode = 1;
  });
}
