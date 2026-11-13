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
 * Worker de conciliacion de pagos inciertos.
 *
 * Uso:
 *   npm run payments:reconcile            # proceso continuo
 *   npm run payments:reconcile -- --once  # una ronda y sale (job programado)
 *
 * Variables de entorno:
 *   PAYMENT_RECONCILE_INTERVAL_MS       espera entre rondas (por defecto 30000)
 *   PAYMENT_RECONCILE_THRESHOLD_SECONDS edad minima de un intento incierto (30)
 *   PAYMENT_RECONCILE_LIMIT              intentos por ronda (50)
 */
export async function runPaymentReconciliationScript() {
  const { parseWorkerInterval, runWorkerLoop } = await import(
    "@/workers/runtime/worker-runtime"
  );
  const { reconcilePendingPaymentsOnce } = await import(
    "@/workers/payments/payment-reconciliation-worker"
  );

  const once = process.argv.includes("--once");
  const intervalMs = parseWorkerInterval(
    process.env.PAYMENT_RECONCILE_INTERVAL_MS,
    30_000,
  );
  const thresholdSeconds = parseWorkerInterval(
    process.env.PAYMENT_RECONCILE_THRESHOLD_SECONDS,
    30,
  );
  const limit = parseWorkerInterval(process.env.PAYMENT_RECONCILE_LIMIT, 50);

  return runWorkerLoop({
    name: "payment-reconciliation",
    intervalMs,
    once,
    run: () => reconcilePendingPaymentsOnce({ thresholdSeconds, limit }),
  });
}

if (process.argv[1] && process.argv[1].includes("payments-reconcile")) {
  runPaymentReconciliationScript()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write(
        `[payments-reconcile] Error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(1);
    });
}
