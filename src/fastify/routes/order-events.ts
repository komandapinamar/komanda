import type { FastifyPluginAsync } from "fastify";
import { OrderQueryService } from "@/features/orders/application/order-query.service";
import {
  formatResetEvent,
  resolveEventCursor,
} from "@/features/orders/domain/order-event-cursor";
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
    let isPolling = false;
    let pollTimer: NodeJS.Timeout | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    const closeStream = () => {
      if (closed) return;
      closed = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
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

    const runPoll = async () => {
      if (closed || isPolling) return;
      isPolling = true;
      try {
        const events = await service.eventsAfter({ context, lastEventId });
        if (closed) return;
        for (const event of events) {
          lastEventId = event.sequence;
          reply.raw.write(
            `id: ${event.sequence}\nevent: order\ndata: ${JSON.stringify(event)}\n\n`,
          );
        }
      } catch {
        closeStream();
      } finally {
        isPolling = false;
      }
    };

    const scheduleNextPoll = (delayMs = 2000) => {
      if (closed) return;
      pollTimer = setTimeout(async () => {
        if (closed) return;
        await runPoll();
        if (!closed) {
          scheduleNextPoll(2000);
        }
      }, delayMs);
    };

    reply.raw.write("retry: 2000\n\n");

    // A malformed or ahead-of-log cursor opens a valid stream but can never
    // deliver events. Signal the client to resync and continue from head.
    try {
      const head = await service.eventsHead({ context });
      if (closed) return;
      const resolution = resolveEventCursor({ raw: lastEventId, head });
      if (resolution.kind === "reset") {
        lastEventId = resolution.head.toString();
        reply.raw.write(
          formatResetEvent({
            reason: resolution.reason,
            head: resolution.head,
          }),
        );
      }
    } catch (error) {
      request.log.error(
        { err: error, correlationId },
        "Failed to resolve order event cursor",
      );
      closeStream();
      return;
    }

    await runPoll();

    if (!closed) {
      scheduleNextPoll(2000);

      heartbeatTimer = setInterval(() => {
        if (!closed) {
          reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
        }
      }, 15000);
    }
  });
};
