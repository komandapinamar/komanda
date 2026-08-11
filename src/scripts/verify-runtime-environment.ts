import "dotenv/config";

import { Buffer } from "node:buffer";

type DeploymentEnvironment = "staging" | "production";

function value(name: string) {
  return process.env[name]?.trim() ?? "";
}

function requireValue(name: string, errors: string[]) {
  if (!value(name)) errors.push(`${name} is required.`);
}

function requireMinLength(name: string, min: number, errors: string[]) {
  const current = value(name);
  if (!current) {
    errors.push(`${name} is required.`);
  } else if (current.length < min) {
    errors.push(`${name} must contain at least ${min} characters.`);
  }
}

function assertUrl(name: string, errors: string[]) {
  const current = value(name);
  if (!current) {
    errors.push(`${name} is required.`);
    return null;
  }
  try {
    return new URL(current);
  } catch {
    errors.push(`${name} must be a valid URL.`);
    return null;
  }
}

function assertBase64Key(name: string, errors: string[]) {
  const current = value(name);
  if (!current) {
    errors.push(`${name} is required.`);
    return;
  }
  if (Buffer.from(current, "base64").byteLength !== 32) {
    errors.push(`${name} must decode to exactly 32 bytes.`);
  }
}

function deploymentEnvironment(errors: string[]): DeploymentEnvironment {
  const current = value("KOMANDA_ENVIRONMENT");
  if (current === "staging" || current === "production") return current;
  errors.push("KOMANDA_ENVIRONMENT must be staging or production.");
  return "staging";
}

function expectedDatabaseHost(errors: string[]): string | null {
  const expected = value("DATABASE_EXPECTED_HOST");
  if (!expected) errors.push("DATABASE_EXPECTED_HOST is required.");
  return expected ? expected.toLowerCase() : null;
}

function verifyDatabase(errors: string[]) {
  const migration = assertUrl("DATABASE_DIRECT_URL", errors);
  const runtime = assertUrl("DATABASE_URL", errors);
  if (!migration || !runtime) return;
  if (migration.username !== "komanda_migration") {
    errors.push("DATABASE_DIRECT_URL must use komanda_migration.");
  }
  if (runtime.username !== "komanda_runtime") {
    errors.push("DATABASE_URL must use komanda_runtime.");
  }
  const expectedHost = expectedDatabaseHost(errors);
  if (expectedHost) {
    for (const [label, url] of [
      ["DATABASE_DIRECT_URL", migration],
      ["DATABASE_URL", runtime],
    ] as const) {
      if (url.hostname.toLowerCase() !== expectedHost) {
        errors.push(
          `${label} must point at DATABASE_EXPECTED_HOST, which is ${expectedHost}; parsed host is ${url.hostname || "(empty)"}.`,
        );
      }
    }
  }
  if (migration.href === runtime.href) {
    errors.push("DATABASE_DIRECT_URL and DATABASE_URL must be distinct.");
  }
}

function verifyMercadoPago(publicBaseUrl: URL | null, errors: string[]) {
  requireValue("MERCADOPAGO_CLIENT_ID", errors);
  requireValue("MERCADOPAGO_CLIENT_SECRET", errors);
  requireMinLength("MERCADOPAGO_WEBHOOK_SECRET", 16, errors);
  const redirect = assertUrl("MERCADOPAGO_REDIRECT_URI", errors);
  if (redirect && publicBaseUrl && redirect.origin !== publicBaseUrl.origin) {
    errors.push("MERCADOPAGO_REDIRECT_URI must use KOMANDA_PUBLIC_BASE_URL origin.");
  }
}

function verifyVerificationDelivery(
  environment: DeploymentEnvironment,
  errors: string[],
) {
  const delivery = value("IDENTITY_VERIFICATION_DELIVERY");
  if (delivery === "http") {
    assertUrl("IDENTITY_VERIFICATION_HTTP_ENDPOINT", errors);
    requireMinLength("IDENTITY_VERIFICATION_HTTP_TOKEN", 32, errors);
    return;
  }
  if (delivery === "capture" && environment === "staging") {
    requireValue("IDENTITY_VERIFICATION_CAPTURE_PATH", errors);
    return;
  }
  if (delivery === "capture" && environment === "production") {
    errors.push("IDENTITY_VERIFICATION_DELIVERY=capture is prohibited in production.");
    return;
  }
  errors.push("IDENTITY_VERIFICATION_DELIVERY must be http or staging-only capture.");
}

function verifyObjectStorage(errors: string[]) {
  requireValue("OBJECT_STORAGE_REGION", errors);
  requireValue("OBJECT_STORAGE_BUCKET", errors);
  requireValue("OBJECT_STORAGE_ACCESS_KEY_ID", errors);
  requireValue("OBJECT_STORAGE_SECRET_ACCESS_KEY", errors);
}

function main() {
  const errors: string[] = [];
  const environment = deploymentEnvironment(errors);
  const publicBaseUrl = assertUrl("KOMANDA_PUBLIC_BASE_URL", errors);
  requireValue("STOREFRONT_ROOT_DOMAIN", errors);
  requireMinLength("KOMANDA_BUSINESS_SERVICE_TOKEN", 32, errors);
  assertBase64Key("APP_ENCRYPTION_KEY_BASE64", errors);
  requireValue("APP_ENCRYPTION_KEY_VERSION", errors);
  verifyDatabase(errors);
  verifyVerificationDelivery(environment, errors);
  verifyObjectStorage(errors);
  verifyMercadoPago(publicBaseUrl, errors);

  if (environment === "production") {
    for (const name of [
      "MOCK_TENANT_SLUG",
      "NEXT_PUBLIC_MOCK_TENANT_SLUG",
      "INITIAL_TENANT_ID",
      "INITIAL_TENANT_LOCATION_ID",
      "INITIAL_TENANT_SLUG",
      "LEGACY_INITIAL_TENANT_ENABLED",
      "MP_ACCESS_TOKEN",
      "PRINT_SERVICE_TOKEN",
      "ADMIN_JWT_SECRET",
    ]) {
      if (value(name)) {
        errors.push(`${name} is not allowed after the multi-tenant cutover.`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Runtime environment is not ready:\n- ${errors.join("\n- ")}`);
  }
  process.stdout.write(
    `Runtime environment verification passed for ${environment}.\n`,
  );
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
