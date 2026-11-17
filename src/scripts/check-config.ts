import "dotenv/config";

// Standalone CLI: stub "server-only" before anything imports @/lib/config.
try {
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as unknown as NodeModule;
} catch {
  // no-op
}

/**
 * Lists the configuration the active profile still needs.
 *
 *   KOMANDA_ENV=prod KOMANDA_SECRETS_DIR=../secrets/komanda npm run config:check
 *
 * Prints names and state only; never values. Exits 1 when a required variable
 * is missing or still contains a template placeholder.
 */
export async function checkConfiguration() {
  const { ConfigurationError, describeConfiguration, loadRuntimeConfig } =
    await import("@/lib/config");

  let valid = true;
  try {
    loadRuntimeConfig({ role: "web" });
  } catch (error) {
    valid = false;
    if (error instanceof ConfigurationError) {
      console.error(error.message);
    } else {
      console.error("Unexpected configuration error:", error);
    }
  }

  const described = describeConfiguration({ role: "web" });
  const placeholder = /<[^>]+>|REPLACE_ME|CHANGE_ME/i;
  const pending = described.variables.filter(
    (variable) =>
      !variable.configured ||
      placeholder.test(process.env[variable.name] ?? ""),
  );

  console.log(`Environment: ${described.environment}`);
  for (const variable of pending) {
    console.log(
      `${variable.required ? "REQUIRED" : "optional"} ${variable.name}`,
    );
  }
  if (pending.length === 0) console.log("All variables configured.");

  if (!valid) process.exitCode = 1;
}

void checkConfiguration();
