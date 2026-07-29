import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withTenantTransaction, type TenantTransaction } from "@/db/tenant-transaction";
import type { TenantContext } from "@/lib/tenant-context/types";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import { appendOutboxEvent } from "@/lib/outbox/outbox.service";
import {
  addonGroupInputSchema,
  addonGroupPatchSchema,
  assertArchivableCategory,
  assertPublishableCombo,
  assertPublishableItem,
  catalogItemInputSchema,
  catalogItemPatchSchema,
  categoryInputSchema,
  categoryPatchSchema,
  comboInputSchema,
  comboPatchSchema,
  normalizeCatalogName,
} from "@/features/catalog/domain/catalog.rules";
import { CatalogRepository } from "@/features/catalog/infrastructure/catalog.repository";

export class CatalogNotFoundError extends Error {}
export class CatalogConflictError extends Error {}
export class CatalogEntitlementDeniedError extends Error {}

async function requireCatalogManagement(repository: CatalogRepository) {
  if (!(await repository.hasCatalogEntitlement())) {
    throw new CatalogEntitlementDeniedError("Catalog management is unavailable.");
  }
}

async function recordMutation(
  transaction: TenantTransaction,
  context: TenantContext,
  input: { action: string; resourceType: string; resourceId: string },
) {
  await appendAuditEvent(transaction, context, {
    ...input,
    outcome: "allowed",
    metadata: {},
  });
  await appendOutboxEvent(transaction, context, {
    aggregateType: input.resourceType,
    aggregateId: input.resourceId,
    eventType: input.action,
    payload: {},
  });
}

function versionedArchiveInput(value: unknown) {
  return z.object({ version: z.number().int().positive() }).strict().parse(value);
}

export class CatalogService {
  listCategories(context: TenantContext) {
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      return repository.listCategories();
    });
  }

  createCategory(context: TenantContext, value: unknown) {
    const input = categoryInputSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      const category = await repository.createCategory({
        ...input,
        normalizedName: normalizeCatalogName(input.name),
      });
      await recordMutation(transaction, context, {
        action: "catalog.category.created",
        resourceType: "catalog_category",
        resourceId: category.id,
      });
      return category;
    });
  }

  updateCategory(context: TenantContext, categoryId: string, value: unknown) {
    const { version, ...input } = categoryPatchSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      if (!(await repository.findCategory(categoryId))) {
        throw new CatalogNotFoundError("Category not found.");
      }
      const category = await repository.updateCategory(categoryId, version, {
        ...input,
        ...(input.name
          ? { normalizedName: normalizeCatalogName(input.name) }
          : {}),
      });
      if (!category) throw new CatalogConflictError("Category version conflict.");
      await recordMutation(transaction, context, {
        action: "catalog.category.updated",
        resourceType: "catalog_category",
        resourceId: category.id,
      });
      return category;
    });
  }

  archiveCategory(context: TenantContext, categoryId: string, value: unknown) {
    const { version } = versionedArchiveInput(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      const category = await repository.findCategory(categoryId);
      if (!category) throw new CatalogNotFoundError("Category not found.");
      assertArchivableCategory({
        sellableChildren: await repository.countCategoryChildren(categoryId),
      });
      const archived = await repository.updateCategory(categoryId, version, {
        status: "archived",
        archivedAt: new Date(),
      });
      if (!archived) throw new CatalogConflictError("Category version conflict.");
      await recordMutation(transaction, context, {
        action: "catalog.category.archived",
        resourceType: "catalog_category",
        resourceId: archived.id,
      });
    });
  }

  listItems(context: TenantContext) {
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      return repository.listItems();
    });
  }

  createItem(context: TenantContext, value: unknown) {
    const input = catalogItemInputSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      const category = await repository.findCategory(input.categoryId);
      const media = await repository.findMedia(input.imageAssetId);
      const groups = await repository.findAddonGroups(input.addonGroupIds);
      if (!category || groups.length !== new Set(input.addonGroupIds).size) {
        throw new CatalogNotFoundError("Catalog relationship not found.");
      }
      if (input.imageAssetId && !media) {
        throw new CatalogNotFoundError("Catalog media not found.");
      }
      if (input.status === "active") {
        assertPublishableItem({
          categoryStatus: category.status,
          mediaStatus: media?.status,
        });
      }
      const { addonGroupIds, ...values } = input;
      const item = await repository.createItem(
        { ...values, normalizedName: normalizeCatalogName(input.name) },
        [...new Set(addonGroupIds)],
      );
      await recordMutation(transaction, context, {
        action: "catalog.item.created",
        resourceType: "catalog_item",
        resourceId: item.id,
      });
      return item;
    });
  }

  updateItem(context: TenantContext, itemId: string, value: unknown) {
    const { version, addonGroupIds, ...input } = catalogItemPatchSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      const current = await repository.findItem(itemId);
      if (!current) throw new CatalogNotFoundError("Item not found.");
      const category = await repository.findCategory(
        input.categoryId ?? current.categoryId,
      );
      const imageAssetId =
        input.imageAssetId === undefined ? current.imageAssetId : input.imageAssetId;
      const media = await repository.findMedia(imageAssetId);
      if (!category || (imageAssetId && !media)) {
        throw new CatalogNotFoundError("Catalog relationship not found.");
      }
      if (addonGroupIds) {
        const groups = await repository.findAddonGroups(addonGroupIds);
        if (groups.length !== new Set(addonGroupIds).size) {
          throw new CatalogNotFoundError("Add-on group not found.");
        }
      }
      if ((input.status ?? current.status) === "active") {
        assertPublishableItem({
          categoryStatus: category.status,
          mediaStatus: media?.status,
        });
      }
      const item = await repository.updateItem(
        itemId,
        version,
        {
          ...input,
          ...(input.name
            ? { normalizedName: normalizeCatalogName(input.name) }
            : {}),
        },
        addonGroupIds ? [...new Set(addonGroupIds)] : undefined,
      );
      if (!item) throw new CatalogConflictError("Item version conflict.");
      await recordMutation(transaction, context, {
        action: "catalog.item.updated",
        resourceType: "catalog_item",
        resourceId: item.id,
      });
      return item;
    });
  }

  archiveItem(context: TenantContext, itemId: string, value: unknown) {
    const { version } = versionedArchiveInput(value);
    return this.updateItem(context, itemId, { version, status: "archived" });
  }

  createAddonGroup(context: TenantContext, value: unknown) {
    const input = addonGroupInputSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      const { options, ...group } = input;
      const created = await repository.createAddonGroup({ group, options });
      await recordMutation(transaction, context, {
        action: "catalog.addon_group.created",
        resourceType: "addon_group",
        resourceId: created.id,
      });
      return created;
    });
  }

  updateAddonGroup(context: TenantContext, groupId: string, value: unknown) {
    const { version, options, ...input } = addonGroupPatchSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      if (!(await repository.findAddonGroup(groupId))) {
        throw new CatalogNotFoundError("Add-on group not found.");
      }
      const updated = await repository.updateAddonGroup(
        groupId,
        version,
        input,
        options,
      );
      if (!updated) throw new CatalogConflictError("Add-on group version conflict.");
      await recordMutation(transaction, context, {
        action: "catalog.addon_group.updated",
        resourceType: "addon_group",
        resourceId: updated.id,
      });
      return updated;
    });
  }

  archiveAddonGroup(context: TenantContext, groupId: string, value: unknown) {
    const { version } = versionedArchiveInput(value);
    return this.updateAddonGroup(context, groupId, {
      version,
      status: "archived",
    });
  }

  createCombo(context: TenantContext, value: unknown) {
    const input = comboInputSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      const category = await repository.findCategory(input.categoryId);
      const media = await repository.findMedia(input.imageAssetId);
      const items = await repository.findItems(input.items.map(({ itemId }) => itemId));
      if (
        !category ||
        (input.imageAssetId && !media) ||
        items.length !== new Set(input.items.map(({ itemId }) => itemId)).size
      ) {
        throw new CatalogNotFoundError("Combo relationship not found.");
      }
      if (input.status === "active") {
        assertPublishableCombo({
          categoryStatus: category.status,
          mediaStatus: media?.status,
          items: input.items.map((line) => ({
            status: items.find(({ id }) => id === line.itemId)!.status,
            quantity: line.quantity,
          })),
        });
      }
      const { items: itemInput, ...values } = input;
      const combo = await repository.createCombo(
        { ...values, normalizedName: normalizeCatalogName(input.name) },
        itemInput,
      );
      await recordMutation(transaction, context, {
        action: "catalog.combo.created",
        resourceType: "catalog_combo",
        resourceId: combo.id,
      });
      return combo;
    });
  }

  updateCombo(context: TenantContext, comboId: string, value: unknown) {
    const { version, items, ...input } = comboPatchSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);
      await requireCatalogManagement(repository);
      if (!(await repository.findCombo(comboId))) {
        throw new CatalogNotFoundError("Combo not found.");
      }
      const values = {
        ...input,
        ...(input.name
          ? { normalizedName: normalizeCatalogName(input.name) }
          : {}),
      };
      if (items) {
        const found = await repository.findItems(items.map(({ itemId }) => itemId));
        if (found.length !== new Set(items.map(({ itemId }) => itemId)).size) {
          throw new CatalogNotFoundError("Combo item not found.");
        }
      }
      const combo = await repository.updateCombo(comboId, version, values, items);
      if (!combo) throw new CatalogConflictError("Combo version conflict.");
      await recordMutation(transaction, context, {
        action: "catalog.combo.updated",
        resourceType: "catalog_combo",
        resourceId: combo.id,
      });
      return combo;
    });
  }

  archiveCombo(context: TenantContext, comboId: string, value: unknown) {
    const { version } = versionedArchiveInput(value);
    return this.updateCombo(context, comboId, { version, status: "archived" });
  }
}

export function catalogRequestId() {
  return randomUUID();
}
