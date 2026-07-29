import { withTenantTransaction } from "@/db/tenant-transaction";
import { CatalogEntitlementDeniedError } from "@/features/catalog/application/catalog.service";
import { CatalogRepository } from "@/features/catalog/infrastructure/catalog.repository";
import {
  MediaRepository,
  objectStorageFromEnvironment,
} from "@/features/catalog/infrastructure/media.repository";
import { catalogErrorResponse } from "@/features/catalog/web/catalog-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string; assetId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, assetId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    const asset = await withTenantTransaction(context, async (transaction) => {
      const catalog = new CatalogRepository(transaction, tenantId);
      if (!(await catalog.hasCatalogEntitlement())) {
        throw new CatalogEntitlementDeniedError("Catalog management is unavailable.");
      }
      return new MediaRepository(
        transaction,
        tenantId,
        objectStorageFromEnvironment(),
      ).complete(assetId);
    });
    return Response.json({
      assetId: asset.id,
      status: asset.status,
      publicUrl: asset.publicUrl,
    });
  } catch (error) {
    return catalogErrorResponse(error, correlationId);
  }
}
