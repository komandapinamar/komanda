import { timingSafeEqual } from "node:crypto";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";
import { expireUnpaidCashOrders } from "@/features/orders/application/expire-unpaid-orders.job";

function isValidCronSecret(authHeader: string | null, cronSecret: string): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();
  const expected = Buffer.from(cronSecret);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  const cronSecret = process.env.CRON_SECRET;
  const authHeader =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");

  if (!cronSecret || !isValidCronSecret(authHeader, cronSecret)) {
    return problemResponse({
      status: 401,
      title: "Unauthorized",
      code: "UNAUTHORIZED",
      detail: "Invalid or missing cron secret.",
      correlationId,
    });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const rawBatchSize = body?.batchSize;
    if (
      rawBatchSize !== undefined &&
      (!Number.isInteger(rawBatchSize) || rawBatchSize < 1)
    ) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        detail: "batchSize must be a positive integer.",
        correlationId,
      });
    }
    const batchSize =
      rawBatchSize !== undefined
        ? Math.min(rawBatchSize as number, 500)
        : undefined;

    const rawTenantId = body?.tenantId;
    if (
      rawTenantId !== undefined &&
      (typeof rawTenantId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          rawTenantId,
        ))
    ) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        detail: "tenantId must be a valid UUID.",
        correlationId,
      });
    }
    const tenantId = rawTenantId as string | undefined;

    const data = await expireUnpaidCashOrders({
      correlationId,
      batchSize,
      tenantId,
    });

    return Response.json(
      {
        success: true,
        data,
        error: null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Correlation-Id": correlationId,
        },
      },
    );
  } catch (error) {
    return problemResponse({
      status: 500,
      title: "Internal Server Error",
      code: "INTERNAL_ERROR",
      detail:
        error instanceof Error ? error.message : "Failed to execute cron job.",
      correlationId,
    });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
