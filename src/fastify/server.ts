import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health";
import { orderEventsRoutes } from "./routes/order-events";
import { printJobsRoutes } from "./routes/print-jobs";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

export async function buildFastifyServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  app.decorateRequest("correlationId", "");

  app.addHook("onRequest", async (request, reply) => {
    const raw = request.headers["x-correlation-id"];
    const id = typeof raw === "string" && raw.trim() ? raw.trim() : randomUUID();
    request.correlationId = id;
    reply.header("X-Correlation-Id", id);
  });

  await app.register(healthRoutes);
  await app.register(orderEventsRoutes);
  await app.register(printJobsRoutes);

  return app;
}
