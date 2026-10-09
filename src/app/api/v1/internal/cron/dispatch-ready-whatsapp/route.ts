import { timingSafeEqual } from "node:crypto";
import { dispatchReadyWhatsApp } from "@/features/orders/application/dispatch-ready-whatsapp.job";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
    return problemResponse({ status: 401, title: "Unauthorized", code: "UNAUTHORIZED", correlationId });
  }
  try {
    const result = await dispatchReadyWhatsApp();
    return Response.json(result, { headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId } });
  } catch {
    return problemResponse({ status: 500, title: "Internal error", code: "INTERNAL_ERROR", correlationId });
  }
}
