import { publicBaseUrl } from "@/lib/config/public-site";

/** The URL is derived from the asset identity, never from its stored S3 endpoint. */
export function mediaPublicUrl(tenantId: string, assetId: string): string {
  return `${publicBaseUrl()}/api/v1/public/media/${tenantId}/${assetId}`;
}

/** Search projections can outlive the media URL that was stored at indexing time. */
export function resolveLegacyMediaUrl(url: string | null, tenantId: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/tenants\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})\.(?:jpg|png|webp|mp4|webm)$/i);
    if (match?.[1]?.toLowerCase() === tenantId.toLowerCase()) {
      return mediaPublicUrl(tenantId, match[2]);
    }
  } catch {
    // Preserve non-URL values from old projections.
  }
  return url;
}
