export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initializeTelemetry, shutdownTelemetry } = await import(
    "./lib/observability/telemetry"
  );
  await initializeTelemetry();

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
