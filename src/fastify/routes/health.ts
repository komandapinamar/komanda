import type { FastifyPluginAsync } from "fastify";
import { collectHealth, collectLiveness, collectReadiness } from "@/lib/observability/health";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/health", async (_request, reply) => {
    const health = await collectHealth();
    reply.header("Cache-Control", "no-store");
    return reply.status(health.status === "down" ? 503 : 200).send(health);
  });

  fastify.get("/api/health/live", async (_request, reply) => {
    const liveness = collectLiveness();
    reply.header("Cache-Control", "no-store");
    return reply.status(200).send(liveness);
  });

  fastify.get("/api/health/ready", async (_request, reply) => {
    const readiness = await collectReadiness();
    reply.header("Cache-Control", "no-store");
    return reply.status(readiness.status === "down" ? 503 : 200).send(readiness);
  });
};
