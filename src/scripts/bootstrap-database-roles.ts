import { bootstrapRuntimeRole } from "./database-role-bootstrap";

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL;
  const runtimePassword = process.env.DATABASE_RUNTIME_PASSWORD;
  if (!connectionString || !runtimePassword) {
    throw new Error(
      "DATABASE_DIRECT_URL and DATABASE_RUNTIME_PASSWORD are required.",
    );
  }
  await bootstrapRuntimeRole({ connectionString, runtimePassword });
  process.stdout.write("Runtime role bootstrap and verification passed.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Role bootstrap failed."}\n`,
  );
  process.exitCode = 1;
});
