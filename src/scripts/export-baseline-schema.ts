import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type JournalEntry = {
  idx: number;
  tag: string;
};

type Journal = {
  entries: JournalEntry[];
};

function main() {
  const drizzleDir = resolve(process.cwd(), "drizzle");
  const journalPath = resolve(drizzleDir, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as Journal;

  const header = `-- =====================================================================
-- KOMANDA DATABASE BASELINE SCHEMA
-- Auto-generated from Drizzle migrations (0000 to ${journal.entries[journal.entries.length - 1]?.tag})
-- Contains: Tables, Types, Triggers, Roles, Extensions, and FORCE RLS Policies.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

`;

  const chunks: string[] = [header];

  for (const entry of journal.entries) {
    const filePath = resolve(drizzleDir, `${entry.tag}.sql`);
    const content = readFileSync(filePath, "utf-8");
    const cleaned = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n");

    chunks.push(`-- --- Migration ${entry.tag} ---\n${cleaned}\n`);
  }

  const outputPath = resolve(drizzleDir, "baseline_schema.sql");
  writeFileSync(outputPath, chunks.join("\n"), "utf-8");
  console.log(`✓ Baseline schema exported successfully to: ${outputPath}`);
}

main();
