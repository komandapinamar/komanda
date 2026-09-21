import { DiscountService } from "@/features/discounts/application/discount.service";
import {
  discountErrorResponse,
  versionFromRequest,
} from "@/features/discounts/web/discount-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwnerOrAdmin } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = {
  params: Promise<{ tenantId: string; discountId: string }>;
};

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, discountId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    requireOwnerOrAdmin(context);

    const discount = await new DiscountService().getDiscount(context, discountId);
    return Response.json(discount);
  } catch (error) {
    return discountErrorResponse(error, correlationId);
  }
}

export async function PATCH(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, discountId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    requireOwnerOrAdmin(context);

    const versionHeader = versionFromRequest(request);
    const body = await request.json();

    const updated = await new DiscountService().updateDiscount(
      context,
      discountId,
      body,
      versionHeader,
    );

    return Response.json(updated);
  } catch (error) {
    return discountErrorResponse(error, correlationId);
  }
}

export async function DELETE(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, discountId } = await route.params;
    const context = await administrativeTenantContext(
      request,
      tenantId,
      correlationId,
    );
    requireOwnerOrAdmin(context);

    const result = await new DiscountService().archiveDiscount(
      context,
      discountId,
    );

    return Response.json(result);
  } catch (error) {
    return discountErrorResponse(error, correlationId);
  }
}
