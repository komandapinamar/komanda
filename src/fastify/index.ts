import "dotenv/config";
import { buildFastifyServer } from "./server";
import { shutdownManager } from "@/lib/runtime/shutdown";

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
