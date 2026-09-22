import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  catalogItems,
  tenants,
} from "@/db/schema";
import { withPlatformServiceTransaction } from "@/db/tenant-transaction";
import { searchProjectionSyncService } from "./search-sync.service";

export class SearchReconciliationService {
  async reconcileAll(): Promise<{
    tenantsSynced: number;
    itemsSynced: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let tenantsSynced = 0;
    let itemsSynced = 0;

    await withPlatformServiceTransaction(
      { serviceId: "search-reconciliation-job", correlationId: randomUUID() },
      async (transaction) => {
        const allTenants = await transaction
          .select({ id: tenants.id })
          .from(tenants);

        for (const tenant of allTenants) {
          try {
            await transaction.execute(
              sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
            );

            // 1. Sync tenant eligibility row
            await searchProjectionSyncService.syncTenantEligibility(
              transaction,
              tenant.id,
            );
            tenantsSynced++;

            // 2. Sync all active, non-archived catalog items
            const activeItems = await transaction
              .select({
                id: catalogItems.id,
                name: catalogItems.name,
                categoryId: catalogItems.categoryId,
                description: catalogItems.description,
                price: catalogItems.price,
                currency: catalogItems.currency,
                status: catalogItems.status,
                archivedAt: catalogItems.archivedAt,
                imageAssetId: catalogItems.imageAssetId,
              })
              .from(catalogItems)
              .where(
                and(
                  eq(catalogItems.tenantId, tenant.id),
                  eq(catalogItems.status, "active"),
                  isNull(catalogItems.archivedAt),
                ),
              );

            for (const item of activeItems) {
              await searchProjectionSyncService.syncItem(
                transaction,
                tenant.id,
                item,
              );
              itemsSynced++;
            }
          } catch (err) {
            errors.push(
              `Tenant ${tenant.id} reconciliation failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }

        // Clean up orphan entries
        await transaction.execute(
          sql`select set_config('app.tenant_id', '', true)`,
        );

        await transaction.execute(
          sql`DELETE FROM catalog_search_entries
              WHERE item_id NOT IN (
                SELECT id FROM catalog_items WHERE status = 'active' AND archived_at IS NULL
              )`,
        );
      },
    );

    return {
      tenantsSynced,
      itemsSynced,
      errors,
    };
  }
}

export const searchReconciliationService = new SearchReconciliationService();
