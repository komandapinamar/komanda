import { and, eq } from "drizzle-orm";
import { withTenantIdTransaction } from "@/db/tenant-transaction";
import { mediaAssets } from "@/db/schema";
import { objectStorageFromEnvironment } from "@/features/catalog/infrastructure/media.repository";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ tenantId: string; assetId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, route: RouteContext) {
  const { tenantId, assetId } = await route.params;
  if (!uuid.test(tenantId) || !uuid.test(assetId)) return notFound();

  const [asset] = await withTenantIdTransaction(tenantId, (transaction) =>
    transaction.select({
      storageKey: mediaAssets.storageKey,
      mimeType: mediaAssets.mimeType,
      byteSize: mediaAssets.byteSize,
    }).from(mediaAssets).where(and(
      eq(mediaAssets.tenantId, tenantId),
      eq(mediaAssets.id, assetId),
      eq(mediaAssets.status, "ready"),
    )).limit(1),
  );
  if (!asset) return notFound();

  const range = request.headers.get("range");
  if (range && (!/^bytes=(?:\d+-\d*|-\d+)$/.test(range) || range.length > 80)) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.byteSize}` } });
  }

  try {
    const object = await objectStorageFromEnvironment().getObject(asset.storageKey, range ?? undefined);
    const headers = new Headers({
      "Content-Type": asset.mimeType,
      "Cache-Control": "public, max-age=300",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    if (object.contentLength !== undefined) headers.set("Content-Length", String(object.contentLength));
    if (object.contentRange) headers.set("Content-Range", object.contentRange);
    return new Response(object.body, { status: object.contentRange ? 206 : 200, headers });
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 416) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.byteSize}` } });
    }
    if (status === 404) return notFound();
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
