import { describe, expect, it, vi } from "vitest";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { SearchProjectionSyncService } from "@/features/search/application/search-sync.service";
import { SearchRepository } from "@/features/search/infrastructure/search.repository";

describe("SearchProjectionSyncService", () => {
  it("removes entry from projection when item status is not active", async () => {
    const deleteSpy = vi
      .spyOn(SearchRepository.prototype, "deleteSearchEntry")
      .mockResolvedValue(undefined);

    const service = new SearchProjectionSyncService();
    const fakeTx = {} as unknown as TenantTransaction;

    await service.syncItem(fakeTx, "tenant-1", {
      id: "item-1",
      name: "Burger",
      categoryId: "cat-1",
      price: "100.00",
      currency: "ARS",
      status: "draft",
    });

    expect(deleteSpy).toHaveBeenCalledWith("item-1");
    deleteSpy.mockRestore();
  });

  it("removes entry from projection when item has archivedAt date", async () => {
    const deleteSpy = vi
      .spyOn(SearchRepository.prototype, "deleteSearchEntry")
      .mockResolvedValue(undefined);

    const service = new SearchProjectionSyncService();
    const fakeTx = {} as unknown as TenantTransaction;

    await service.syncItem(fakeTx, "tenant-1", {
      id: "item-2",
      name: "Pizza",
      categoryId: "cat-1",
      price: "200.00",
      currency: "ARS",
      status: "active",
      archivedAt: new Date(),
    });

    expect(deleteSpy).toHaveBeenCalledWith("item-2");
    deleteSpy.mockRestore();
  });

  it("delegates removeItem directly to repository deleteSearchEntry", async () => {
    const deleteSpy = vi
      .spyOn(SearchRepository.prototype, "deleteSearchEntry")
      .mockResolvedValue(undefined);

    const service = new SearchProjectionSyncService();
    const fakeTx = {} as unknown as TenantTransaction;

    await service.removeItem(fakeTx, "item-3");
    expect(deleteSpy).toHaveBeenCalledWith("item-3");
    deleteSpy.mockRestore();
  });

  it("delegates syncCategoryRename to repository updateCategoryNameForEntries", async () => {
    const updateSpy = vi
      .spyOn(SearchRepository.prototype, "updateCategoryNameForEntries")
      .mockResolvedValue(undefined);

    const service = new SearchProjectionSyncService();
    const fakeTx = {} as unknown as TenantTransaction;

    await service.syncCategoryRename(
      fakeTx,
      "tenant-1",
      "cat-1",
      "Pizzas Gourmet",
    );
    expect(updateSpy).toHaveBeenCalledWith(
      "tenant-1",
      "cat-1",
      "Pizzas Gourmet",
    );
    updateSpy.mockRestore();
  });
});
