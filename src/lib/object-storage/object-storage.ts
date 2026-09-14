import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type PresignedUploadRequest = {
  tenantId: string;
  assetId: string;
  mimeType: string;
  byteSize: number;
  checksumSha256Base64: string;
};

export type PresignedUpload = {
  key: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
};

export interface ObjectStorage {
  createPresignedUpload(input: PresignedUploadRequest): Promise<PresignedUpload>;
  verifyObject(
    key: string,
    expected: { byteSize: number; checksumSha256Base64: string },
  ): Promise<boolean>;
  createReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function buildTenantStorageKey(
  tenantId: string,
  assetId: string,
  mimeType: string,
) {
  const extension = extensions[mimeType];
  if (!extension) {
    throw new Error("Unsupported media type.");
  }

  if (!tenantId || !assetId || tenantId.includes("/") || assetId.includes("/")) {
    throw new Error("Invalid tenant or asset identifier.");
  }

  return `tenants/${tenantId}/media/${assetId}.${extension}`;
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly uploadTtlSeconds = 300,
  ) {}

  async createPresignedUpload(
    input: PresignedUploadRequest,
  ): Promise<PresignedUpload> {
    const key = buildTenantStorageKey(
      input.tenantId,
      input.assetId,
      input.mimeType,
    );
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.mimeType,
      ContentLength: input.byteSize,
      ChecksumSHA256: input.checksumSha256Base64,
      Metadata: { tenantId: input.tenantId, assetId: input.assetId },
    });

    return {
      key,
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.uploadTtlSeconds,
      }),
      headers: {
        "content-type": input.mimeType,
        "x-amz-checksum-sha256": input.checksumSha256Base64,
      },
      expiresAt: new Date(Date.now() + this.uploadTtlSeconds * 1000),
    };
  }

  async verifyObject(
    key: string,
    expected: { byteSize: number; checksumSha256Base64: string },
  ) {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return (
      result.ContentLength === expected.byteSize &&
      result.ChecksumSHA256 === expected.checksumSha256Base64
    );
  }

  createReadUrl(key: string, expiresInSeconds = 300) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
