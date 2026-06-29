import { NextResponse } from "next/server";
import { getAuthenticatedAdminSession } from "@/features/admin-panel/server/auth.service";
import { listOrdersInProgress } from "@/features/shop/checkout/server/order.service";
import type { AdminOrdersStreamPayload } from "@/types/types";

const encoder = new TextEncoder();
const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializePayload(payload: AdminOrdersStreamPayload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function retryMessage() {
  return `retry: ${POLL_INTERVAL_MS}\n\n`;
}

function heartbeatMessage() {
  return `: heartbeat ${Date.now()}\n\n`;
}

export async function GET(request: Request) {
  const adminSession = await getAuthenticatedAdminSession();

  if (!adminSession) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let closed = false;
  let lastSnapshot = "";
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const closeStream = () => {
        if (closed) {
          return;
        }

        closed = true;

        if (pollTimer) {
          clearInterval(pollTimer);
        }

        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }

        try {
          controller.close();
        } catch {}
      };

      const enqueue = (message: string) => {
        if (closed) {
          return;
        }

        controller.enqueue(encoder.encode(message));
      };

      const sendOrdersIfChanged = async () => {
        try {
          const orders = await listOrdersInProgress();

          if (closed) {
            return;
          }

          const snapshot = JSON.stringify(orders);

          if (snapshot === lastSnapshot) {
            return;
          }

          lastSnapshot = snapshot;

          enqueue(
            serializePayload({
              orders,
              generatedAt: new Date().toISOString(),
            }),
          );
        } catch (error) {
          console.error("[admin-orders-stream] Failed to load active orders.", error);
          closeStream();
        }
      };

      enqueue(retryMessage());
      await sendOrdersIfChanged();

      pollTimer = setInterval(() => {
        void sendOrdersIfChanged();
      }, POLL_INTERVAL_MS);

      heartbeatTimer = setInterval(() => {
        enqueue(heartbeatMessage());
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", closeStream, { once: true });
    },
    cancel() {
      closed = true;

      if (pollTimer) {
        clearInterval(pollTimer);
      }

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
