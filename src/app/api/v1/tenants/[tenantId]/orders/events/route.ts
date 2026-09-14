import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { OrderQueryService } from "@/features/orders/application/order-query.service";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

const encoder = new TextEncoder();
const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eventMessage(input: { id: string; data: unknown }) {
  return `id: ${input.id}\nevent: order\ndata: ${JSON.stringify(input.data)}\n\n`;
}

function heartbeatMessage() {
  return `: heartbeat ${Date.now()}\n\n`;
}

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    let lastEventId =
      request.headers.get("last-event-id") ??
      new URL(request.url).searchParams.get("cursor") ??
      null;
    let closed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const service = new OrderQueryService();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const closeStream = () => {
          if (closed) return;
          closed = true;
          if (pollTimer) clearInterval(pollTimer);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          try {
            controller.close();
          } catch {}
        };

        const enqueue = (message: string) => {
          if (!closed) controller.enqueue(encoder.encode(message));
        };

        const sendEvents = async () => {
          try {
            const events = await service.eventsAfter({ context, lastEventId });
            for (const event of events) {
              lastEventId = event.sequence;
              enqueue(eventMessage({ id: event.sequence, data: event }));
            }
          } catch (error) {
            console.error("[orders:sse] Failed to read order events.", error);
            closeStream();
          }
        };

        enqueue(`retry: ${POLL_INTERVAL_MS}\n\n`);
        await sendEvents();
        pollTimer = setInterval(() => {
          void sendEvents();
        }, POLL_INTERVAL_MS);
        heartbeatTimer = setInterval(() => {
          enqueue(heartbeatMessage());
        }, HEARTBEAT_INTERVAL_MS);
        request.signal.addEventListener("abort", closeStream, { once: true });
      },
      cancel() {
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (error) {
    return orderErrorResponse(error, correlationId);
  }
}
