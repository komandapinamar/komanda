import { DiscountService } from "@/features/discounts/application/discount.service";
import { discountErrorResponse } from "@/features/discounts/web/discount-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwnerOrAdmin } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    requireOwnerOrAdmin(context);

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;
    const offset = url.searchParams.get("offset")
      ? Number(url.searchParams.get("offset"))
      : undefined;

    const result = await new DiscountService().listDiscounts(context, {
      status,
      limit,
      offset,
    });

    return Response.json(result);
  } catch (error) {
    return discountErrorResponse(error, correlationId);
  }
}

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    requireOwnerOrAdmin(context);

    const body = await request.json();
    const discount = await new DiscountService().createDiscount(context, body);

    return Response.json(discount, { status: 201 });
  } catch (error) {
    return discountErrorResponse(error, correlationId);
  }
}
