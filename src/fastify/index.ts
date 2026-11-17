import "dotenv/config";

// Al correr fuera de Next.js (tsx en dev o en el contenedor de produccion),
// "server-only" lanza porque la condicion react-server no existe. El stub en
// require.cache permite que @/db y los servicios se ejecuten. Tiene que estar
// instalado antes de importar cualquier modulo que llegue a "server-only", y
// ESM hoistea los imports estaticos por encima del cuerpo del modulo: por eso
// todo lo que toca "server-only" se importa de forma dinamica dentro de main().
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

async function main() {
  const { loadRuntimeConfig } = await import("@/lib/config");
  const { initializeTelemetry } = await import("@/lib/observability/telemetry");
  loadRuntimeConfig({ role: "fastify" });
  await initializeTelemetry("komanda-fastify");
  const { buildFastifyServer } = await import("./server");
  const { shutdownManager } = await import("@/lib/runtime/shutdown");

  const port = Number(process.env.FASTIFY_PORT ?? process.env.PORT ?? 3001);
  const host = process.env.FASTIFY_HOST ?? "0.0.0.0";

  const server = await buildFastifyServer();

  shutdownManager.registerHook(async () => {
    console.info("[fastify] Closing Fastify server...");
    await server.close();
    console.info("[fastify] Fastify server closed.");
  });

  try {
    const address = await server.listen({ port, host });
    console.info(`[fastify] Core Fastify listening at ${address}`);
  } catch (error) {
    console.error("[fastify] Failed to start Fastify server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[fastify] Fatal startup error:", error);
  process.exit(1);
});
