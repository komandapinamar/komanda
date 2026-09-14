import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const migrationUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error("Missing DATABASE_DIRECT_URL or DATABASE_URL environment variable.");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});
