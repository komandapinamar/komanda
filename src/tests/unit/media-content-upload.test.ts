import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { putObject, state } = vi.hoisted(() => ({
  putObject: vi.fn().mockResolvedValue(undefined),
  state: { pending: null as null | Record<string, unknown> },
}));

vi.mock("@/features/identity/web/tenant-authority", () => ({
  administrativeTenantContext: vi.fn(async (_request, tenantId) => ({ tenantId })),
}));
vi.mock("@/features/catalog/infrastructure/catalog.repository", () => ({
  CatalogRepository: class {
    hasCatalogEntitlement() { return Promise.resolve(true); }
  },
}));
vi.mock("@/features/catalog/infrastructure/media.repository", async (importOriginal) => ({
  ...await importOriginal<object>(),
  objectStorageFromEnvironment: () => ({ putObject }),
}));
vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => state.pending ? [state.pending] : [] }) }),
      }),
    }),
}));

import { PUT } from "@/app/api/v1/tenants/[tenantId]/media/[assetId]/content/route";

const tenantId = "8543603f-521a-41a3-90de-dae24bc10ac7";
const assetId = "7dc0b4ad-176e-4017-8d2c-cc66874cd054";
const content = new TextEncoder().encode("a valid image body");
const checksum = createHash("sha256").update(content).digest("hex");

function upload(bytes = content) {
  return PUT(new Request(`http://localhost/api/v1/tenants/${tenantId}/media/${assetId}/content`, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: bytes,
  }), { params: Promise.resolve({ tenantId, assetId }) });
}

describe("same-origin media upload", () => {
  beforeEach(() => {
    putObject.mockClear();
    state.pending = {
      storageKey: `tenants/${tenantId}/media/${assetId}.jpg`,
      mimeType: "image/jpeg",
      byteSize: content.byteLength,
      checksumSha256: checksum,
    };
  });

  it("accepts matching bytes without sending a private storage URL to the browser", async () => {
    const response = await upload();
    expect(response.status).toBe(204);
    expect(putObject).toHaveBeenCalledWith(expect.objectContaining({
      key: `tenants/${tenantId}/media/${assetId}.jpg`,
      body: content,
    }));
  });

  it("rejects changed contents without storing them", async () => {
    const altered = new TextEncoder().encode("a wrong image body");
    const response = await upload(altered);
    expect(response.status).toBe(409);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("does not store an asset absent from the tenant-scoped lookup", async () => {
    state.pending = null;
    const response = await upload();
    expect(response.status).toBe(404);
    expect(putObject).not.toHaveBeenCalled();
  });
});
