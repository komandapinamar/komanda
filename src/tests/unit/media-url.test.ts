import { afterEach, describe, expect, it } from "vitest";
import { mediaPublicUrl, resolveLegacyMediaUrl } from "@/features/catalog/domain/media-url";

const tenantId = "8543603f-521a-41a3-90de-dae24bc10ac7";
const assetId = "7dc0b4ad-176e-4017-8d2c-cc66874cd054";
const originalSite = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSite;
});

describe("public media URLs", () => {
  it("uses the canonical HTTPS host rather than the private storage endpoint", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://hamburguesasdeautor.lat";
    expect(mediaPublicUrl(tenantId, assetId)).toBe(
      `https://hamburguesasdeautor.lat/api/v1/public/media/${tenantId}/${assetId}`,
    );
  });

  it("recovers old search projection images without rewriting other tenants or unrelated URLs", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://hamburguesasdeautor.lat";
    const old = `http://127.0.0.1:9000/komanda-dev-media/tenants/${tenantId}/media/${assetId}.jpg`;

    expect(resolveLegacyMediaUrl(old, tenantId)).toBe(mediaPublicUrl(tenantId, assetId));
    expect(resolveLegacyMediaUrl(old, "123e4567-e89b-12d3-a456-426614174000")).toBe(old);
    expect(resolveLegacyMediaUrl("https://example.com/photo.jpg", tenantId))
      .toBe("https://example.com/photo.jpg");
  });
});
