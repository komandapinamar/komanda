import {
  InvalidMercadoPagoWebhookError,
  parseSanitizedMercadoPagoWebhook,
  verifyMercadoPagoWebhook,
} from "@/features/payments/infrastructure/mercadopago-webhook.verifier";
import { ZodError } from "zod";
import {
  MercadoPagoWebhookProviderError,
  MercadoPagoWebhookRoutingError,
  receiveMercadoPagoWebhook,
} from "@/features/payments/application/mercadopago-webhook.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ routingKey: string }> };

function unauthorized(correlationId: string) {
  return problemResponse({
    status: 401,
    title: "Unauthorized",
    code: "WEBHOOK_UNAUTHORIZED",
    correlationId,
  });
}

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return unauthorized(correlationId);
  }

  try {
    const { routingKey } = await route.params;
    const payload = await request.json().catch(() => ({}));
    const event = parseSanitizedMercadoPagoWebhook(payload);
    const signature = request.headers.get("x-signature") ?? "";
    const requestId = request.headers.get("x-request-id") ?? "";

    verifyMercadoPagoWebhook({
      signature,
      requestId,
      dataId: event.resourceId,
      secret,
    });

    const received = await receiveMercadoPagoWebhook({
      routingKey,
      event,
      payload: {
        providerEventId: event.providerEventId,
        resourceId: event.resourceId,
        topic: event.topic,
        action: event.action,
      },
      correlationId,
    });

    return Response.json(
      {
        accepted: true,
        duplicate: received.duplicate,
      },
      {
        status: 202,
        headers: { "X-Correlation-Id": correlationId },
      },
    );
  } catch (error) {
    if (
      error instanceof InvalidMercadoPagoWebhookError ||
      error instanceof SyntaxError ||
      error instanceof ZodError
    ) {
      return unauthorized(correlationId);
    }

    if (error instanceof MercadoPagoWebhookRoutingError) {
      return nonDisclosingNotFound(correlationId);
    }

    if (error instanceof MercadoPagoWebhookProviderError) {
      return problemResponse({
        status: 503,
        title: "Payment provider unavailable",
        code: "PAYMENT_PROVIDER_UNAVAILABLE",
        correlationId,
      });
    }

    return problemResponse({
      status: 500,
      title: "Internal Server Error",
      code: "INTERNAL_ERROR",
      correlationId,
    });
  }
}
