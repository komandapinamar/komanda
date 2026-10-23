import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health";
import { orderEventsRoutes } from "./routes/order-events";
import { printJobsRoutes } from "./routes/print-jobs";
import { shutdownManager } from "@/lib/runtime/shutdown";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
    pressureRequestDone: (() => void) | null;
  }
}

export async function buildFastifyServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  app.decorateRequest("correlationId", "");
  app.decorateRequest("pressureRequestDone", null);

  app.addHook("onRequest", async (request, reply) => {
    const raw = request.headers["x-correlation-id"];
    const id = typeof raw === "string" && raw.trim() ? raw.trim() : randomUUID();
    request.correlationId = id;
    reply.header("X-Correlation-Id", id);

    try {
      request.pressureRequestDone = shutdownManager.trackRequest();
    } catch {
      return reply.status(503).send({
        status: 503,
        title: "Service Unavailable",
        code: "SERVER_DRAINING",
        correlationId: id,
      });
    }
  });

  app.addHook("onResponse", async (request) => {
    request.pressureRequestDone?.();
    request.pressureRequestDone = null;
  });

  app.addHook("onError", async (request) => {
    request.pressureRequestDone?.();
    request.pressureRequestDone = null;
  });

  await app.register(healthRoutes);
  await app.register(orderEventsRoutes);
  await app.register(printJobsRoutes);

  return app;
}
