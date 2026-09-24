import "server-only";

import { eq } from "drizzle-orm";
import {
  catalogSearchEntries,
  publicSearchTenants,
  storefrontItemEvents,
  storefrontSessions,
  discountRedemptions,
  discountCategories,
  discountItems,
  discounts,
  billingDocuments,
  tenantPrintJobs,
  cashRegisterMovements,
  mpFinancialRecords,
  orderEvents,
  orderLineOptions,
  orderLines,
  tenantOrders,
  paymentAttempts,
  cartLineOptions,
  cartLines,
  carts,
  inventoryMovements,
  inventoryLevels,
  cashShifts,
  printAgentPairings,
  printerDestinations,
  printAgents,
  comboItems,
  catalogCombos,
  itemAddonGroups,
  addonOptions,
  addonGroups,
  catalogItems,
  catalogCategories,
  mediaAssets,
  providerResourceRoutes,
  integrationAccounts,
  webhookEvents,
  onboardingHandoffs,
  tenantSettings,
  tenantCounters,
  tenantLocations,
  tenantEntitlementSnapshots,
  idempotencyRecords,
  auditEvents,
  outboxEvents,
  tenantMemberships,
  tenants,
} from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import type { TenantContext } from "@/lib/tenant-context/types";
import { requireOwner } from "@/lib/authorization/role-guard";

export class TenantDeletionService {
  async deleteTenant(context: TenantContext): Promise<void> {
    requireOwner(context);
    const tenantId = context.tenantId;

    await withTenantTransaction(context, async (tx) => {
      // 1. Search projections
      await tx.delete(catalogSearchEntries).where(eq(catalogSearchEntries.tenantId, tenantId));
      await tx.delete(publicSearchTenants).where(eq(publicSearchTenants.tenantId, tenantId));

      // 2. Storefront events & sessions
      await tx.delete(storefrontItemEvents).where(eq(storefrontItemEvents.tenantId, tenantId));
      await tx.delete(storefrontSessions).where(eq(storefrontSessions.tenantId, tenantId));

      // 3. Discounts & redemptions
      await tx.delete(discountRedemptions).where(eq(discountRedemptions.tenantId, tenantId));
      await tx.delete(discountCategories).where(eq(discountCategories.tenantId, tenantId));
      await tx.delete(discountItems).where(eq(discountItems.tenantId, tenantId));
      await tx.delete(discounts).where(eq(discounts.tenantId, tenantId));

      // 4. Billing, Print jobs, Cash & MP records
      await tx.delete(billingDocuments).where(eq(billingDocuments.tenantId, tenantId));
      await tx.delete(tenantPrintJobs).where(eq(tenantPrintJobs.tenantId, tenantId));
      await tx.delete(cashRegisterMovements).where(eq(cashRegisterMovements.tenantId, tenantId));
      await tx.delete(mpFinancialRecords).where(eq(mpFinancialRecords.tenantId, tenantId));

      // 5. Order details & events
      await tx.delete(orderEvents).where(eq(orderEvents.tenantId, tenantId));
      await tx.delete(orderLineOptions).where(eq(orderLineOptions.tenantId, tenantId));
      await tx.delete(orderLines).where(eq(orderLines.tenantId, tenantId));

      // 6. Orders
      await tx.delete(tenantOrders).where(eq(tenantOrders.tenantId, tenantId));

      // 7. Payment attempts & Carts
      await tx.delete(paymentAttempts).where(eq(paymentAttempts.tenantId, tenantId));
      await tx.delete(cartLineOptions).where(eq(cartLineOptions.tenantId, tenantId));
      await tx.delete(cartLines).where(eq(cartLines.tenantId, tenantId));
      await tx.delete(carts).where(eq(carts.tenantId, tenantId));

      // 8. Inventory & Cash shifts
      await tx.delete(inventoryMovements).where(eq(inventoryMovements.tenantId, tenantId));
      await tx.delete(inventoryLevels).where(eq(inventoryLevels.tenantId, tenantId));
      await tx.delete(cashShifts).where(eq(cashShifts.tenantId, tenantId));

      // 9. Printing infrastructure
      await tx.delete(printAgentPairings).where(eq(printAgentPairings.tenantId, tenantId));
      await tx.delete(printerDestinations).where(eq(printerDestinations.tenantId, tenantId));
      await tx.delete(printAgents).where(eq(printAgents.tenantId, tenantId));

      // 10. Combos & Addons
      await tx.delete(comboItems).where(eq(comboItems.tenantId, tenantId));
      await tx.delete(catalogCombos).where(eq(catalogCombos.tenantId, tenantId));
      await tx.delete(itemAddonGroups).where(eq(itemAddonGroups.tenantId, tenantId));
      await tx.delete(addonOptions).where(eq(addonOptions.tenantId, tenantId));
      await tx.delete(addonGroups).where(eq(addonGroups.tenantId, tenantId));

      // 11. Catalog items, Categories & Media
      await tx.delete(catalogItems).where(eq(catalogItems.tenantId, tenantId));
      await tx.delete(catalogCategories).where(eq(catalogCategories.tenantId, tenantId));
      await tx.delete(mediaAssets).where(eq(mediaAssets.tenantId, tenantId));

      // 12. Integrations & routes
      await tx.delete(providerResourceRoutes).where(eq(providerResourceRoutes.tenantId, tenantId));
      await tx.delete(integrationAccounts).where(eq(integrationAccounts.tenantId, tenantId));
      await tx.delete(webhookEvents).where(eq(webhookEvents.tenantId, tenantId));

      // 13. Tenant configuration & locations
      await tx.delete(onboardingHandoffs).where(eq(onboardingHandoffs.tenantId, tenantId));
      await tx.delete(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
      await tx.delete(tenantCounters).where(eq(tenantCounters.tenantId, tenantId));
      await tx.delete(tenantLocations).where(eq(tenantLocations.tenantId, tenantId));
      await tx.delete(tenantEntitlementSnapshots).where(eq(tenantEntitlementSnapshots.tenantId, tenantId));

      // 14. Observability & events
      await tx.delete(idempotencyRecords).where(eq(idempotencyRecords.tenantId, tenantId));
      await tx.delete(auditEvents).where(eq(auditEvents.tenantId, tenantId));
      await tx.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));

      // 15. Memberships
      await tx.delete(tenantMemberships).where(eq(tenantMemberships.tenantId, tenantId));

      // 16. The tenant itself
      await tx.delete(tenants).where(eq(tenants.id, tenantId));
    });
  }
}
