import "dotenv/config";

// In standalone CLI execution via tsx, "server-only" throws because the Next.js
// react-server condition is not present. Stubbing it in require.cache permits
// application services and @/db to execute safely in CLI cron runners.
//
// The stub has to be installed before anything that imports it, and ESM
// hoists static imports above the module body. Every import that reaches
// "server-only" (directly or through @/db) must therefore be dynamic.
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
 * Worker de la outbox.
 *
 * Uso:
 *   npm run outbox:dispatch            # proceso continuo
 *   npm run outbox:dispatch -- --once  # una ronda y sale (job programado)
 *
 * Variables de entorno:
 *   OUTBOX_DISPATCH_INTERVAL_MS  espera entre rondas (por defecto 2000)
 *   OUTBOX_DISPATCH_BATCH_SIZE   eventos por ronda (por defecto 25)
 */
export async function runOutboxDispatchScript() {
  const { parseWorkerInterval, runWorkerLoop } = await import(
    "@/workers/runtime/worker-runtime"
  );
  const { dispatchOutboxOnce } = await import(
    "@/workers/outbox/outbox-dispatch-worker"
  );

  const once = process.argv.includes("--once");
  const intervalMs = parseWorkerInterval(
    process.env.OUTBOX_DISPATCH_INTERVAL_MS,
    2_000,
  );
  const batchSize = parseWorkerInterval(
    process.env.OUTBOX_DISPATCH_BATCH_SIZE,
    25,
  );

  return runWorkerLoop({
    name: "outbox-dispatch",
    intervalMs,
    once,
    run: () => dispatchOutboxOnce({ batchSize }),
  });
}

if (process.argv[1] && process.argv[1].includes("outbox-dispatch")) {
  runOutboxDispatchScript()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write(
        `[outbox-dispatch] Error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(1);
    });
}
