import type { FastifyPluginAsync } from "fastify";
import { OrderQueryService } from "@/features/orders/application/order-query.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import { shutdownManager } from "@/lib/runtime/shutdown";

export const orderEventsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { tenantId: string };
    Querystring: { cursor?: string };
  }>("/api/v1/tenants/:tenantId/orders/events", async (request, reply) => {
    const { tenantId } = request.params;
    const correlationId = request.correlationId;

    const context = createVerifiedTenantContext({
      tenantId,
      correlationId,
      source: "administrative",
      actor: { kind: "service", serviceId: "fastify:orders-sse" },
    });

    let lastEventId: string | null =
      (request.headers["last-event-id"] as string | undefined) ??
      request.query.cursor ??
      null;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Correlation-Id": correlationId,
    });

    let closed = false;
    let pollTimer: NodeJS.Timeout | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    const closeStream = () => {
      if (closed) return;
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try {
        reply.raw.end();
      } catch {}
    };

    const unregisterShutdown = shutdownManager.registerSseClient(closeStream);

    request.raw.on("close", () => {
      unregisterShutdown();
      closeStream();
    });

    const service = new OrderQueryService();

    const sendEvents = async () => {
      if (closed) return;
      try {
        const events = await service.eventsAfter({ context, lastEventId });
        for (const event of events) {
          lastEventId = event.sequence;
          reply.raw.write(
            `id: ${event.sequence}\nevent: order\ndata: ${JSON.stringify(event)}\n\n`,
          );
        }
      } catch {
        closeStream();
      }
    };

    reply.raw.write("retry: 2000\n\n");
    await sendEvents();

    pollTimer = setInterval(() => {
      void sendEvents();
    }, 2000);

    heartbeatTimer = setInterval(() => {
      if (!closed) {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
      }
    }, 15000);
  });
};
