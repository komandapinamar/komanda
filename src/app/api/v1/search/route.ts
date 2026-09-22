import { NextResponse } from "next/server";
import { searchQueryService } from "@/features/search/application/search-query.service";
import { searchQuerySchema } from "@/features/search/domain/search.schemas";
import { globalSearchRateLimiter } from "@/features/search/infrastructure/search-rate-limiter";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

export async function GET(request: Request) {
  const correlationId = correlationIdFromRequest(request);

  // 1. IP Rate Limiting (AD-5: max 30 req/min per IP)
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateLimit = globalSearchRateLimiter.checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many search requests. Please try again later.",
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-Correlation-Id": correlationId,
        },
      },
    );
  }

  globalSearchRateLimiter.recordRequest(clientIp);

  // 2. Parse and validate query parameters
  const url = new URL(request.url);
  const rawQ = url.searchParams.get("q") ?? "";
  const rawProductsLimit = url.searchParams.get("productsLimit") ?? undefined;
  const rawBusinessesLimit =
    url.searchParams.get("businessesLimit") ?? undefined;

  const parseResult = searchQuerySchema.safeParse({
    q: rawQ,
    productsLimit: rawProductsLimit,
    businessesLimit: rawBusinessesLimit,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: parseResult.error.issues.map((i) => i.message).join(", "),
        },
      },
      {
        status: 400,
        headers: {
          "X-Correlation-Id": correlationId,
        },
      },
    );
  }

  // 3. Execute search
  try {
    const data = await searchQueryService.search(parseResult.data);
    return NextResponse.json(
      {
        success: true,
        data,
        error: null,
      },
      {
        status: 200,
        headers: {
          "X-Correlation-Id": correlationId,
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred while searching.",
        },
      },
      {
        status: 500,
        headers: {
          "X-Correlation-Id": correlationId,
        },
      },
    );
  }
}
