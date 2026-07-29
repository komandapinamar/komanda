import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export type SecretEnvelope = {
  algorithm: "aes-256-gcm";
  keyVersion: number;
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
};

type EnvelopeContext = {
  tenantId: string;
  provider: string;
  key: Buffer;
};

type EncryptContext = EnvelopeContext & { keyVersion: number };

function validateKey(key: Buffer) {
  if (key.byteLength !== 32) {
    throw new Error("AES-256-GCM requires exactly 32 key bytes.");
  }
}

function additionalAuthenticatedData(
  tenantId: string,
  provider: string,
  keyVersion: number,
) {
  return Buffer.from(
    JSON.stringify({ tenantId, provider, keyVersion }),
    "utf8",
  );
}

export function encryptSecret(
  value: unknown,
  context: EncryptContext,
): SecretEnvelope {
  validateKey(context.key);
  if (!Number.isSafeInteger(context.keyVersion) || context.keyVersion < 1) {
    throw new Error("Encryption key version must be a positive integer.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", context.key, iv);
  cipher.setAAD(
    additionalAuthenticatedData(
      context.tenantId,
      context.provider,
      context.keyVersion,
    ),
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: "aes-256-gcm",
    keyVersion: context.keyVersion,
    ciphertext,
    iv,
    authTag: cipher.getAuthTag(),
  };
}

export function decryptSecret<T = unknown>(
  envelope: SecretEnvelope,
  context: EnvelopeContext,
): T {
  validateKey(context.key);
  if (envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported secret envelope algorithm.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    context.key,
    envelope.iv,
  );
  decipher.setAAD(
    additionalAuthenticatedData(
      context.tenantId,
      context.provider,
      envelope.keyVersion,
    ),
  );
  decipher.setAuthTag(envelope.authTag);
  const plaintext = Buffer.concat([
    decipher.update(envelope.ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function encryptionKeyFromBase64(value: string) {
  const key = Buffer.from(value, "base64");
  validateKey(key);
  return key;
}
