import "dotenv/config";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { bootstrapRuntimeRole } from "./database-role-bootstrap";
import {
  EXPECTED_PROTECTED_TABLES,
  verifyDatabaseRoles,
} from "./verify-database-roles";
import { verifyMigrationJournal } from "./verify-migration-journal";

const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalHost(hostname: string) {
  return LOCAL_HOSTS.has(hostname.replace(/^\[|\]$/g, ""));
}

function redact(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.username}:***@${url.host}${url.pathname}`;
  } catch {
    return "***";
  }
}

function generateSecurePassword(length = 32): string {
  return randomBytes(length)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length);
}

function parsedUsername(raw: string | undefined) {
  if (!raw) return null;
  try {
    return decodeURIComponent(new URL(raw).username);
  } catch {
    return null;
  }
}

function buildRuntimeUrl(directUrl: string, runtimePassword: string): string {
  const url = new URL(directUrl);
  url.username = "komanda_runtime";
  url.password = runtimePassword;
  return url.toString();
}

async function main() {
  console.log("\n=== Komanda - Inicializador de base de datos (local / vacia) ===\n");

  const directUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!directUrl) {
    throw new Error(
      "DATABASE_DIRECT_URL or DATABASE_URL is required. For staging/production use `pnpm db:prepare`, which has the environment gate.",
    );
  }

  let parsedDirect: URL;
  try {
    parsedDirect = new URL(directUrl);
  } catch {
    throw new Error(
      "DATABASE_DIRECT_URL is not a valid URL (expected postgresql://user:pass@host:5432/database).",
    );
  }
  if (!["postgresql:", "postgres:"].includes(parsedDirect.protocol)) {
    throw new Error("DATABASE_DIRECT_URL must use the postgresql:// protocol.");
  }

  if (!isLocalHost(parsedDirect.hostname)) {
    throw new Error(
      `Refusing to initialise a remote database (${parsedDirect.hostname}). ` +
        "This command has no environment gate and no production confirmation, so it is restricted to local/empty databases. " +
        "Use `pnpm db:prepare` (requires KOMANDA_ENVIRONMENT, DATABASE_EXPECTED_HOST and the production confirmation token).",
    );
  }

  const local = isLocalHost(parsedDirect.hostname);
  const sslOption = local ? undefined : { rejectUnauthorized: true };

  console.log(`Host: ${parsedDirect.hostname}:${parsedDirect.port || 5432}/${parsedDirect.pathname.replace(/^\//, "")}`);
  console.log(`Migration user: ${decodeURIComponent(parsedDirect.username)}`);

  const pool = new Pool({ connectionString: directUrl, max: 1, ssl: sslOption });
  const client = await pool.connect();
  try {
    const version = await client.query<{ version: string }>("select version()");
    console.log(`Engine: ${version.rows[0]?.version.split(" on ")[0]}\n`);

    console.log("1/4 Provisioning roles (least privilege)");
    const provided =
      process.env.DATABASE_RUNTIME_PASSWORD ??
      process.env.KOMANDA_BOOTSTRAP_RUNTIME_PASSWORD;
    if (provided && provided.length < 32) {
      throw new Error(
        `DATABASE_RUNTIME_PASSWORD is ${provided.length} characters; the minimum is 32. Fix the variable instead of letting this script rotate the role.`,
      );
    }

    const existingRole = await client.query<{ rolcanlogin: boolean }>(
      "select rolcanlogin from pg_roles where rolname = 'komanda_runtime'",
    );
    if (!provided && existingRole.rows[0]?.rolcanlogin) {
      throw new Error(
        "komanda_runtime already exists and can log in. Set DATABASE_RUNTIME_PASSWORD explicitly; refusing to auto-rotate an existing role because that invalidates the running application's DATABASE_URL.",
      );
    }

    const runtimePassword = provided ?? generateSecurePassword(32);
    await bootstrapRuntimeRole({
      connectionString: directUrl,
      runtimePassword,
    });
    console.log("    komanda_runtime: NOBYPASSRLS, subject to FORCE RLS");
    console.log("    komanda_analytics: read-only, sanitized views only");

    console.log("\n2/4 Applying migrations");
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    const journal = await verifyMigrationJournal({
      connectionString: directUrl,
      requireComplete: true,
    });
    console.log(`    ${journal.appliedCount}/${journal.sourceCount} migrations applied`);

    console.log("\n3/4 Auditing FORCE ROW LEVEL SECURITY");
    const runtimeUrl =
      parsedUsername(process.env.DATABASE_URL) === "komanda_runtime"
        ? process.env.DATABASE_URL!
        : buildRuntimeUrl(directUrl, runtimePassword);
    const audit = await verifyDatabaseRoles({
      runtimeUrl,
      migrationUrl: directUrl,
    });
    console.log(
      `    ${audit.runtime.tables.length}/${EXPECTED_PROTECTED_TABLES.length} protected tables verified`,
    );

    // Ready-to-paste .env lines go to a 0600 file, never to stdout: they embed
    // the admin password, and scrollback, CI logs and shell transcripts outlive
    // the terminal session.
    const credentialsPath = resolve(process.cwd(), ".komanda-db-credentials");
    await mkdir(dirname(credentialsPath), { recursive: true });
    await writeFile(
      credentialsPath,
      [
        `DATABASE_DIRECT_URL=${directUrl}`,
        `DATABASE_URL=${runtimeUrl}`,
        ...(provided ? [] : [`DATABASE_RUNTIME_PASSWORD=${runtimePassword}`]),
        "",
      ].join("\n"),
      { mode: 0o600 },
    );

    console.log("\n=== Ready ===\n");
    console.log("Append to your .env (secrets redacted here on purpose):\n");
    console.log(`  DATABASE_URL=${redact(runtimeUrl)}`);
    console.log(
      `  DATABASE_RUNTIME_PASSWORD=${
        provided ? "<already set>" : "<generated, see file below>"
      }`,
    );
    console.log(`\n    Full ready-to-paste lines: ${credentialsPath} (mode 0600)\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nDatabase initialisation failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});