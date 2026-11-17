import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  config,
  ConfigurationError,
  describeConfiguration,
  loadRuntimeConfig,
  resetConfigurationCache,
  resolveEnvironment,
} from "@/lib/config";

function secretsDirectory(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), "komanda-secrets-"));
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(join(directory, name), value);
  }
  return directory;
}

describe("runtime configuration", () => {
  beforeEach(() => {
    resetConfigurationCache();
  });

  it("maps environment aliases to prod/stg/test", () => {
    expect(resolveEnvironment("production")).toBe("prod");
    expect(resolveEnvironment("prod")).toBe("prod");
    expect(resolveEnvironment("staging")).toBe("stg");
    expect(resolveEnvironment("stg")).toBe("stg");
    expect(resolveEnvironment("test")).toBe("test");
    expect(resolveEnvironment("development")).toBe("test");
    expect(resolveEnvironment("unknown")).toBe("test");
  });

  it("loads the mounted environment file without overriding process.env", () => {
    const directory = secretsDirectory({
      "test.env": "DATABASE_URL=from-file\nOBJECT_STORAGE_BUCKET=bucket-file\n",
    });
    vi.stubEnv("KOMANDA_ENV", "test");
    vi.stubEnv("KOMANDA_SECRETS_DIR", directory);
    vi.stubEnv("DATABASE_URL", "from-process");

    loadRuntimeConfig({ role: "web" });

    expect(process.env.DATABASE_URL).toBe("from-process");
    expect(process.env.OBJECT_STORAGE_BUCKET).toBe("bucket-file");
  });

  it("supports per-variable secret files", () => {
    const directory = mkdtempSync(join(tmpdir(), "komanda-secrets-"));
    writeFileSync(join(directory, "DATABASE_URL"), " file-value \n");
    vi.stubEnv("KOMANDA_ENV", "test");
    vi.stubEnv("KOMANDA_SECRETS_DIR", directory);
    vi.stubEnv("DATABASE_URL", "");

    loadRuntimeConfig({ role: "web" });

    expect(process.env.DATABASE_URL).toBe("file-value");
  });

  it("fails fast when prod lacks required configuration, without leaking values", () => {
    vi.stubEnv("KOMANDA_ENV", "prod");
    vi.stubEnv("KOMANDA_SECRETS_DIR", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_HEADERS", "Authorization=Basic%20c2VjcmV0");
    vi.stubEnv("KOMANDA_TELEMETRY_IDENTIFIER_KEY", "");
    vi.stubEnv("APP_ENCRYPTION_KEY_BASE64", "");

    let caught: unknown;
    try {
      loadRuntimeConfig({ role: "web" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConfigurationError);
    const problems = (caught as ConfigurationError).problems.join("\n");
    expect(problems).toContain("DATABASE_URL");
    expect(problems).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
    expect(problems).toContain("KOMANDA_TELEMETRY_IDENTIFIER_KEY");
    expect(problems).not.toContain("c2VjcmV0");
  });

  it("does not require deployment secrets in the test profile", () => {
    vi.stubEnv("KOMANDA_ENV", "test");
    expect(loadRuntimeConfig({ role: "web" })).toBe("test");
    expect(config.telemetry.enabled()).toBe(false);
  });

  it("treats telemetry as mandatory in prod and stg", () => {
    vi.stubEnv("KOMANDA_ENV", "stg");
    expect(config.telemetry.enabled()).toBe(true);
    vi.stubEnv("KOMANDA_ENV", "prod");
    expect(config.telemetry.enabled()).toBe(true);
  });

  it("defaults the sampling ratio and clamps invalid values", () => {
    vi.stubEnv("OTEL_TRACES_SAMPLER_ARG", "");
    expect(config.telemetry.samplingRatio()).toBe(0.1);
    vi.stubEnv("OTEL_TRACES_SAMPLER_ARG", "2");
    expect(config.telemetry.samplingRatio()).toBe(0.1);
    vi.stubEnv("OTEL_TRACES_SAMPLER_ARG", "0");
    expect(config.telemetry.samplingRatio()).toBe(0);
  });

  it("describes configuration without exposing secret values", () => {
    vi.stubEnv("KOMANDA_ENV", "prod");
    vi.stubEnv("DATABASE_URL", "postgres://runtime:super-secret@db/komanda");
    const described = describeConfiguration();
    expect(described.environment).toBe("prod");
    expect(JSON.stringify(described)).not.toContain("super-secret");
    expect(described.variables.find((entry) => entry.name === "DATABASE_URL")).toMatchObject({
      secret: true,
      configured: true,
    });
  });
});
