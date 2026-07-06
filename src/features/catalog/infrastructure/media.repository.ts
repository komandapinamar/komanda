import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { S3Client } from "@aws-sdk/client-s3";
import { mediaAssets } from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import {
  S3ObjectStorage,
  type ObjectStorage,
} from "@/lib/object-storage/object-storage";

export class MediaAssetNotFoundError extends Error {}
export class MediaVerificationError extends Error {}

export class MediaRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
    private readonly storage: ObjectStorage,
  ) {}

  async createUpload(input: {
    mimeType: string;
    byteSize: number;
    checksumSha256: string;
  }) {
    const assetId = randomUUID();
    const checksumSha256Base64 = Buffer.from(
      input.checksumSha256,
      "hex",
    ).toString("base64");
    const upload = await this.storage.createPresignedUpload({
      tenantId: this.tenantId,
      assetId,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      checksumSha256Base64,
    });
    await this.transaction.insert(mediaAssets).values({
      id: assetId,
      tenantId: this.tenantId,
      storageKey: upload.key,
      checksumSha256: input.checksumSha256,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      status: "pending",
    });
    return {
      assetId,
      uploadUrl: upload.url,
      requiredHeaders: upload.headers,
      expiresAt: upload.expiresAt,
    };
  }

  async complete(assetId: string) {
    const [asset] = await this.transaction
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.tenantId, this.tenantId),
          eq(mediaAssets.id, assetId),
        ),
      )
      .limit(1);
    if (!asset) throw new MediaAssetNotFoundError("Media asset not found.");
    if (asset.status === "ready") {
      return asset;
    }
    const verified = await this.storage.verifyObject(asset.storageKey, {
      byteSize: asset.byteSize,
      checksumSha256Base64: Buffer.from(
        asset.checksumSha256,
        "hex",
      ).toString("base64"),
    });
    if (!verified) {
      await this.transaction
        .update(mediaAssets)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(mediaAssets.tenantId, this.tenantId),
            eq(mediaAssets.id, assetId),
          ),
        );
      throw new MediaVerificationError("Uploaded object failed verification.");
    }
    const publicUrl = await this.storage.createReadUrl(asset.storageKey, 3600);
    const [ready] = await this.transaction
      .update(mediaAssets)
      .set({ status: "ready", publicUrl, updatedAt: new Date() })
      .where(
        and(
          eq(mediaAssets.tenantId, this.tenantId),
          eq(mediaAssets.id, assetId),
          eq(mediaAssets.status, "pending"),
        ),
      )
      .returning();
    if (!ready) throw new MediaVerificationError("Media asset state changed.");
    return ready;
  }
}

export function objectStorageFromEnvironment(): ObjectStorage {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const region = process.env.OBJECT_STORAGE_REGION;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("Object storage is not configured.");
  }
  return new S3ObjectStorage(
    new S3Client({
      region,
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  );
}
