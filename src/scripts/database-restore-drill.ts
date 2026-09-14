import "dotenv/config";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";

const execFileAsync = promisify(execFile);
const RESTORE_CONFIRMATION = "I_UNDERSTAND_THIS_RECREATES_A_STAGING_DATABASE";

type TableFingerprint = {
  schema: string;
  table: string;
  rowCount: string;
  checksum: string;
  rowSecurity: boolean;
  forceRowSecurity: boolean;
};

type DatabaseFingerprint = Awaited<ReturnType<typeof fingerprint>>;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function relationIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`Unsafe PostgreSQL relation identifier: ${value}`);
  }
  return `"${value}"`;
}

function databaseIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(value)) {
    throw new Error(`Unsafe PostgreSQL database identifier: ${value}`);
  }
  return `"${value}"`;
}

function postgresEnvironment(url: URL, database: string) {
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: database,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGCHANNELBINDING: url.searchParams.get("channel_binding") || "prefer",
  };
}

function withDatabase(url: URL, database: string) {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  return copy.toString();
}

async function fingerprint(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const version = await pool.query<{ server_version_num: string }>(
      "show server_version_num",
    );
    const relations = await pool.query<{
      schema_name: string;
      table_name: string;
      row_security: boolean;
      force_row_security: boolean;
    }>(`
      select n.nspname as schema_name,
             c.relname as table_name,
             c.relrowsecurity as row_security,
             c.relforcerowsecurity as force_row_security
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r'
        and n.nspname in ('public', 'drizzle')
      order by n.nspname, c.relname
    `);

    const tables: TableFingerprint[] = [];
    for (const relation of relations.rows) {
      const qualified = `${relationIdentifier(relation.schema_name)}.${relationIdentifier(relation.table_name)}`;
      const result = await pool.query<{ row_count: string; checksum: string }>(`
        select count(*)::text as row_count,
               coalesce(
                 md5(string_agg(row_hash, '' order by row_hash)),
                 md5('')
               ) as checksum
        from (
          select md5(row_to_json(source_row)::text) as row_hash
          from ${qualified} source_row
        ) rows
      `);
      tables.push({
        schema: relation.schema_name,
        table: relation.table_name,
        rowCount: result.rows[0]?.row_count ?? "0",
        checksum: result.rows[0]?.checksum ?? "",
        rowSecurity: relation.row_security,
        forceRowSecurity: relation.force_row_security,
      });
    }

    return {
      serverVersion: version.rows[0]?.server_version_num ?? "unknown",
      tables,
    };
  } finally {
    await pool.end();
  }
}

function summarizeFingerprint(value: DatabaseFingerprint | undefined) {
  if (!value) return undefined;
  return {
    serverVersion: value.serverVersion,
    tableCount: value.tables.length,
    totalRows: value.tables
      .reduce((total, table) => total + BigInt(table.rowCount), BigInt(0))
      .toString(),
    rowSecurityTableCount: value.tables.filter((table) => table.rowSecurity).length,
    forceRowSecurityTableCount: value.tables.filter(
      (table) => table.forceRowSecurity,
    ).length,
    fingerprintSha256: createHash("sha256")
      .update(JSON.stringify(value.tables))
      .digest("hex"),
    nonEmptyTables: value.tables
      .filter((table) => table.rowCount !== "0")
      .map((table) => ({
        relation: `${table.schema}.${table.table}`,
        rowCount: table.rowCount,
        checksum: table.checksum,
      })),
  };
}

async function recreateDatabase(adminUrl: string, databaseName: string) {
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  const database = databaseIdentifier(databaseName);
  try {
    await pool.query(`drop database if exists ${database} with (force)`);
    await pool.query(`create database ${database} template template0`);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(adminUrl: string, databaseName: string) {
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    await pool.query(
      `drop database if exists ${databaseIdentifier(databaseName)} with (force)`,
    );
  } finally {
    await pool.end();
  }
}

async function main() {
  if (required("KOMANDA_ENVIRONMENT") !== "staging") {
    throw new Error("The restore drill is restricted to KOMANDA_ENVIRONMENT=staging.");
  }
  if (required("CONFIRM_DATABASE_RESTORE_DRILL") !== RESTORE_CONFIRMATION) {
    throw new Error(
      `Set CONFIRM_DATABASE_RESTORE_DRILL=${RESTORE_CONFIRMATION}.`,
    );
  }

  const source = new URL(required("DATABASE_DIRECT_URL"));
  const sourceDatabase = source.pathname.replace(/^\//, "");
  const restoreDatabase =
    process.env.DATABASE_RESTORE_DATABASE?.trim() || "komanda_restore_drill";
  if (!restoreDatabase.startsWith("komanda_restore_")) {
    throw new Error("DATABASE_RESTORE_DATABASE must start with komanda_restore_.");
  }
  if (restoreDatabase === sourceDatabase) {
    throw new Error("Restore database must differ from the source database.");
  }

  const adminUrl = withDatabase(source, "postgres");
  const restoreUrl = withDatabase(source, restoreDatabase);
  const reportPath = resolve(
    process.env.DATABASE_RESTORE_REPORT ||
      "../artifacts/001-multi-tenant-base/staging-restore-drill.json",
  );
  const workDirectory = await mkdtemp(join(tmpdir(), "komanda-restore-"));
  const dumpPath = join(workDirectory, "staging.dump");
  const startedAt = new Date();
  let sourceFingerprint: Awaited<ReturnType<typeof fingerprint>> | undefined;
  let restoredFingerprint: Awaited<ReturnType<typeof fingerprint>> | undefined;
  let failure: string | undefined;

  try {
    sourceFingerprint = await fingerprint(source.toString());
    await recreateDatabase(adminUrl, restoreDatabase);
    await execFileAsync("pg_dump", ["--format=custom", `--file=${dumpPath}`], {
      env: postgresEnvironment(source, sourceDatabase),
      maxBuffer: 10 * 1024 * 1024,
    });
    await execFileAsync(
      "pg_restore",
      ["--exit-on-error", "--no-owner", `--dbname=${restoreDatabase}`, dumpPath],
      {
        env: postgresEnvironment(source, restoreDatabase),
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    restoredFingerprint = await fingerprint(restoreUrl);
    if (JSON.stringify(sourceFingerprint) !== JSON.stringify(restoredFingerprint)) {
      throw new Error("Restored schema, RLS flags, row counts or checksums differ.");
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const finishedAt = new Date();
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      `${JSON.stringify(
        {
          environment: "staging",
          sourceDatabase,
          restoreDatabase,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          elapsedSeconds: (finishedAt.getTime() - startedAt.getTime()) / 1_000,
          status: failure ? "failed" : "passed",
          failure,
          source: summarizeFingerprint(sourceFingerprint),
          restored: summarizeFingerprint(restoredFingerprint),
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    if (process.env.KEEP_DATABASE_RESTORE !== "1") {
      await dropDatabase(adminUrl, restoreDatabase).catch(() => undefined);
    }
    await rm(workDirectory, { recursive: true, force: true });
  }

  process.stdout.write(`Staging restore drill passed. Report: ${reportPath}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Database restore drill failed."}\n`,
  );
  process.exitCode = 1;
});
