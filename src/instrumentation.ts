export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { loadRuntimeConfig } = await import("./lib/config");
  const { initializeTelemetry, shutdownTelemetry } = await import(
    "./lib/observability/telemetry"
  );

  // Telemetry is a requirement, not a toggle: prod/stg fail fast if their
  // endpoint, headers or identifier key are missing.
  loadRuntimeConfig({ role: "web" });
  await initializeTelemetry(configServiceName());

  // Next owns SIGTERM/SIGINT (it drains and exits with a signal code). Do not
  // install the Fastify shutdown manager here: closing the pool and exiting
  // would race Next's own cleanup. This listener only attempts a bounded flush
  // and never prevents or replaces the runtime's normal termination.
  const flush = () => {
    void shutdownTelemetry();
  };
  process.once("SIGTERM", flush);
  process.once("SIGINT", flush);
}

function configServiceName() {
  return process.env.OTEL_SERVICE_NAME?.trim() || "komanda-web";
}
