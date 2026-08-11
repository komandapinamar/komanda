import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { bootstrapRuntimeRole } from "./database-role-bootstrap";
import { verifyDatabaseRoles } from "./verify-database-roles";
import { verifyMigrationJournal } from "./verify-migration-journal";

type DatabaseEnvironment = "staging" | "production";
type DatabaseProvider = "azure" | "gcp" | "external";

const PRODUCTION_CONFIRMATION = "I_UNDERSTAND_THIS_TOUCHES_PRODUCTION";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function databaseEnvironment(): DatabaseEnvironment {
  const value = required("KOMANDA_ENVIRONMENT");
  if (value !== "staging" && value !== "production") {
    throw new Error("KOMANDA_ENVIRONMENT must be staging or production.");
  }
  return value;
}

function databaseProvider(): DatabaseProvider {
  const value = (process.env.DATABASE_PROVIDER ?? "").trim().toLowerCase();
  if (value === "azure" || value === "gcp" || value === "external") {
    return value;
  }
  throw new Error(
    "DATABASE_PROVIDER must be azure, gcp, or external to validate the connection host.",
  );
}

function providerLabel(provider: DatabaseProvider) {
  switch (provider) {
    case "azure":
      return "azure-postgresql-flexible-server";
    case "gcp":
      return "google-cloud-sql-postgres";
    case "external":
      return "external-postgres";
  }
}

function parsedDatabaseUrl(name: string, expectedUser: string) {
  const raw = required(name);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    throw new Error(`${name} must use the postgresql:// protocol.`);
  }
  if (decodeURIComponent(url.username) !== expectedUser) {
    throw new Error(`${name} must connect as ${expectedUser}.`);
  }
  if (!url.hostname) {
    throw new Error(`${name} must include a database host.`);
  }
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode !== "require" && sslMode !== "verify-full") {
    throw new Error(`${name} must include sslmode=require or sslmode=verify-full.`);
  }
  return {
    raw,
    host: url.hostname,
    database: url.pathname.replace(/^\//, ""),
    user: decodeURIComponent(url.username),
    sslMode,
  };
}

async function migrateDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: { rejectUnauthorized: true },
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}

async function runtimeConnectionWorks(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: { rejectUnauthorized: true },
  });
  try {
    const result = await pool.query<{ current_user: string }>(
      "select current_user",
    );
    return result.rows[0]?.current_user === "komanda_runtime";
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function writeReport(input: {
  environment: DatabaseEnvironment;
  provider: DatabaseProvider;
  migration: ReturnType<typeof parsedDatabaseUrl>;
  runtime: ReturnType<typeof parsedDatabaseUrl>;
}) {
  const reportPath = resolve(
    process.env.DATABASE_PREPARE_REPORT ??
      `../artifacts/001-multi-tenant-base/${input.environment}-database-readiness.json`,
  );
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        environment: input.environment,
        checkedAt: new Date().toISOString(),
        provider: providerLabel(input.provider),
        database: {
          host: input.migration.host,
          name: input.migration.database,
          migrationRole: input.migration.user,
          runtimeRole: input.runtime.user,
          sslMode: input.runtime.sslMode,
        },
        checks: [
          "runtime-role-bootstrap",
          "migration-journal-hashes",
          "drizzle-migrations",
          "runtime-role-distinct-from-migration-role",
          "runtime-role-without-superuser-or-bypassrls",
          "tenant-owned-tables-force-rls",
          "tenant-id-not-null",
          "public-constraints-validated",
        ],
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return reportPath;
}

async function main() {
  const environment = databaseEnvironment();
  if (
    environment === "production" &&
    process.env.CONFIRM_PRODUCTION_DATABASE_PREPARE !== PRODUCTION_CONFIRMATION
  ) {
    throw new Error(
      `Set CONFIRM_PRODUCTION_DATABASE_PREPARE=${PRODUCTION_CONFIRMATION} before preparing production.`,
    );
  }

  const provider = databaseProvider();
  const migration = parsedDatabaseUrl("DATABASE_DIRECT_URL", "komanda_migration");
  const runtime = parsedDatabaseUrl("DATABASE_URL", "komanda_runtime");
  const expectedHost = required("DATABASE_EXPECTED_HOST").toLowerCase();
  if (migration.raw === runtime.raw) {
    throw new Error("DATABASE_DIRECT_URL and DATABASE_URL must be distinct.");
  }
  if (migration.host !== runtime.host || migration.database !== runtime.database) {
    throw new Error("Migration and runtime URLs must point to the same database.");
  }
  if (migration.host.toLowerCase() !== expectedHost) {
    throw new Error(
      `Database host does not match DATABASE_EXPECTED_HOST: ${migration.host}.`,
    );
  }

  if (!(await runtimeConnectionWorks(runtime.raw))) {
    await bootstrapRuntimeRole({
      connectionString: migration.raw,
      runtimePassword: required("DATABASE_RUNTIME_PASSWORD"),
    });
  }
  await verifyMigrationJournal({
    connectionString: migration.raw,
    requireComplete: false,
  });
  await migrateDatabase(migration.raw);
  await verifyMigrationJournal({
    connectionString: migration.raw,
    requireComplete: true,
  });
  await verifyDatabaseRoles({
    migrationUrl: migration.raw,
    runtimeUrl: runtime.raw,
  });
  const reportPath = await writeReport({ environment, provider, migration, runtime });
  process.stdout.write(
    `${environment} database prepared and verified. Report: ${reportPath}\n`,
  );
}

main().catch((error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOTFOUND"
  ) {
    process.stderr.write(
      [
        "PostgreSQL DNS could not be resolved.",
        "A private database must be reached from the environment's private network path (VM/job/VPN/proxy).",
        `Original error: ${error instanceof Error ? error.message : "ENOTFOUND"}`,
      ].join("\n") + "\n",
    );
    process.exitCode = 1;
    return;
  }
  process.stderr.write(
    `${error instanceof Error ? error.message : "Database preparation failed."}\n`,
  );
  process.exitCode = 1;
});