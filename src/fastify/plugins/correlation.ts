import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

export const correlationPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("correlationId", "");

  fastify.addHook("onRequest", async (request, reply) => {
    const raw = request.headers["x-correlation-id"];
    const id = typeof raw === "string" && raw.trim() ? raw.trim() : randomUUID();
    request.correlationId = id;
    reply.header("X-Correlation-Id", id);
  });
};
