import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { mediaAssets } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { CatalogEntitlementDeniedError } from "@/features/catalog/application/catalog.service";
import { CatalogRepository } from "@/features/catalog/infrastructure/catalog.repository";
import {
  MediaAssetNotFoundError,
  MediaVerificationError,
  objectStorageFromEnvironment,
} from "@/features/catalog/infrastructure/media.repository";
import { catalogErrorResponse } from "@/features/catalog/web/catalog-http";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ tenantId: string; assetId: string }> };
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!body) throw new InvalidMediaUploadError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new InvalidMediaUploadError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

class InvalidMediaUploadError extends Error {}

export async function PUT(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId, assetId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    const declaredLength = request.headers.get("content-length");
    const length = declaredLength === null ? null : Number(declaredLength);
    if (length !== null && (!Number.isSafeInteger(length) || length < 1 || length > MAX_UPLOAD_BYTES)) {
      throw new InvalidMediaUploadError();
    }
    const mimeType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const asset = await withTenantTransaction(context, async (transaction) => {
      const catalog = new CatalogRepository(transaction, tenantId);
      if (!(await catalog.hasCatalogEntitlement())) {
        throw new CatalogEntitlementDeniedError("Catalog management is unavailable.");
      }
      const [pending] = await transaction.select({
        storageKey: mediaAssets.storageKey,
        mimeType: mediaAssets.mimeType,
        byteSize: mediaAssets.byteSize,
        checksumSha256: mediaAssets.checksumSha256,
      }).from(mediaAssets).where(and(
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.id, assetId),
        eq(mediaAssets.status, "pending"),
      )).limit(1);
      if (!pending) throw new MediaAssetNotFoundError("Pending media asset not found.");
      return pending;
    });
    if (asset.mimeType !== mimeType || (length !== null && length !== asset.byteSize)) {
      throw new MediaVerificationError("Media content does not match upload request.");
    }
    const bytes = await readLimitedBody(request.body, Math.min(asset.byteSize, MAX_UPLOAD_BYTES));
    if (bytes.byteLength === 0 || (length !== null && bytes.byteLength !== length)) {
      throw new InvalidMediaUploadError();
    }
    if (asset.byteSize !== bytes.byteLength ||
      createHash("sha256").update(bytes).digest("hex") !== asset.checksumSha256) {
      throw new MediaVerificationError("Media content does not match upload request.");
    }
    await objectStorageFromEnvironment().putObject({
      key: asset.storageKey,
      body: bytes,
      mimeType: asset.mimeType,
      checksumSha256Base64: Buffer.from(asset.checksumSha256, "hex").toString("base64"),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof InvalidMediaUploadError) {
      return Response.json({ code: "VALIDATION_FAILED", message: "Invalid media size." }, { status: 422 });
    }
    return catalogErrorResponse(error, correlationId);
  }
}
