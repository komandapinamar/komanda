import type { FastifyPluginAsync } from "fastify";
import { PrintJobService } from "@/features/printing/application/print-job.service";
import { printingErrorResponse } from "@/features/printing/web/printing-http";

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export const printJobsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/v1/print/jobs/claim", async (request, reply) => {
    const correlationId = request.correlationId;
    const token = extractBearer(request.headers.authorization);
    if (!token) {
      return reply.status(401).send({
        status: 401,
        title: "Unauthorized",
        code: "UNAUTHORIZED",
        correlationId,
      });
    }

    try {
      const claim = await new PrintJobService().claim(token, correlationId);
      if (!claim) {
        return reply.status(204).send();
      }
      return reply.status(200).send(claim);
    } catch (error) {
      const res = printingErrorResponse(error, correlationId);
      return reply.status(res.status).send(await res.json());
    }
  });

  fastify.post<{
    Params: { jobId: string };
  }>("/api/v1/print/jobs/:jobId/result", async (request, reply) => {
    const correlationId = request.correlationId;
    const token = extractBearer(request.headers.authorization);
    const idempotencyKey = (
      request.headers["idempotency-key"] as string | undefined
    )?.trim();

    if (!token) {
      return reply.status(401).send({
        status: 401,
        title: "Unauthorized",
        code: "UNAUTHORIZED",
        correlationId,
      });
    }

    if (!idempotencyKey) {
      return reply.status(422).send({
        status: 422,
        title: "Validation failed",
        code: "IDEMPOTENCY_KEY_REQUIRED",
        correlationId,
      });
    }

    try {
      const { jobId } = request.params;
      const result = await new PrintJobService().reportResult({
        token,
        correlationId,
        jobId,
        idempotencyKey,
        body: request.body,
      });
      return reply.status(200).send(result);
    } catch (error) {
      const res = printingErrorResponse(error, correlationId);
      return reply.status(res.status).send(await res.json());
    }
  });
};
