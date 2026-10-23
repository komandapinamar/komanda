import "dotenv/config";

// In standalone CLI execution via tsx, "server-only" throws because the Next.js
// react-server condition is not present. Stubbing it in require.cache permits
// application services and @/db to execute safely in CLI cron runners.
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

export async function runExpireUnpaidCashOrdersScript() {
  const { expireUnpaidCashOrders } = await import(
    "@/features/orders/application/expire-unpaid-orders.job"
  );
  const result = await expireUnpaidCashOrders();
  process.stdout.write(
    `[expire-unpaid-cash-orders] Expired ${result.expiredCount} order(s): ${JSON.stringify(result.expiredOrderIds)}\n`,
  );
  return result;
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith("expire-unpaid-cash-orders.ts") ||
    process.argv[1].endsWith("expire-unpaid-cash-orders.js"))
) {
  runExpireUnpaidCashOrdersScript()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write(
        `[expire-unpaid-cash-orders] Error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(1);
    });
}
