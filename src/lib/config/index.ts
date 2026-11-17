import "server-only";

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Registro unico de configuracion del runtime.
 *
 * El archivo `.env` versionado solo declara `KOMANDA_ENV` (prod | stg | test).
 * Los valores y secretos reales se inyectan por ambiente:
 *
 *   1. Variables ya presentes en `process.env` (contenedor, systemd, CI).
 *   2. Archivos montados en `KOMANDA_SECRETS_DIR`
 *      (por defecto `/run/secrets/komanda`):
 *        - `<dir>/<entorno>.env`  formato KEY=VALUE
 *        - `<dir>/<NAME>`         contenido literal de una variable
 *
 * `process.env` gana sobre los archivos para permitir overrides operativos y
 * tests. Los valores de archivos se copian a `process.env` para que el codigo
 * que todavia lee `process.env` siga funcionando durante la migracion por
 * etapas.
 */

export type Environment = "prod" | "stg" | "test";
export type RuntimeRole = "web" | "fastify" | "worker" | "script";

const ENVIRONMENT_ALIASES: Record<string, Environment> = {
  prod: "prod",
  production: "prod",
  stg: "stg",
  staging: "stg",
  test: "test",
  testing: "test",
  dev: "test",
  development: "test",
};

export class ConfigurationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid runtime configuration:\n- ${problems.join("\n- ")}`);
    this.name = "ConfigurationError";
  }
}

export function resolveEnvironment(
  value = process.env.KOMANDA_ENV ??
    process.env.KOMANDA_ENVIRONMENT ??
    process.env.NODE_ENV,
): Environment {
  const normalized = value?.trim().toLowerCase() ?? "";
  return ENVIRONMENT_ALIASES[normalized] ?? "test";
}

type VariableSpec = {
  /** Secretos nunca se imprimen ni se devuelven en mensajes de error. */
  secret?: boolean;
  /** Entornos que no pueden arrancar sin este valor. */
  requiredIn?: Environment[];
  /** Roles que consumen la variable; por defecto todos. */
  roles?: RuntimeRole[];
  description: string;
};

const core = {
  KOMANDA_ENV: { description: "Entorno activo: prod | stg | test." },
  KOMANDA_PUBLIC_BASE_URL: { description: "URL publica base de Komanda." },
  NEXT_PUBLIC_SITE_URL: { description: "URL publica del storefront." },
  STOREFRONT_ROOT_DOMAIN: { description: "Dominio raiz del storefront." },
  KOMANDA_CORE_URL: { description: "URL interna del Core API." },
  KOMANDA_BUSINESS_SERVICE_TOKEN: {
    secret: true,
    description: "Token de servicio para llamadas internas.",
  },
  KOMANDA_BUSINESS_PREVIOUS_SERVICE_TOKEN: {
    secret: true,
    description: "Token de servicio anterior durante rotacion.",
  },
  CRON_SECRET: { secret: true, description: "Secreto de invocacion de crons." },
  TZ: { description: "Zona horaria del proceso." },
} satisfies Record<string, VariableSpec>;

const telemetry = {
  OTEL_EXPORTER_OTLP_ENDPOINT: {
    requiredIn: ["prod", "stg"],
    description: "Endpoint OTLP base de Grafana Cloud (https://.../otlp).",
  },
  OTEL_EXPORTER_OTLP_HEADERS: {
    secret: true,
    requiredIn: ["prod", "stg"],
    description: "Headers OTLP, p. ej. Authorization=Basic%20<base64>.",
  },
  KOMANDA_TELEMETRY_IDENTIFIER_KEY: {
    secret: true,
    requiredIn: ["prod", "stg"],
    description: "Clave HMAC (>=32 caracteres) compartida por los 4 servicios.",
  },
  OTEL_SERVICE_NAME: {
    description: "Identidad del servicio; cada proceso la define.",
  },
  KOMANDA_SERVICE_VERSION: {
    description: "Version desplegada, adjunta como service.version.",
  },
  OTEL_TRACES_SAMPLER_ARG: {
    description: "Ratio de muestreo de trazas entre 0 y 1 (por defecto 0.1).",
  },
} satisfies Record<string, VariableSpec>;

const database = {
  DATABASE_URL: {
    secret: true,
    requiredIn: ["prod", "stg"],
    description: "Conexion runtime sujeta a RLS.",
  },
  DATABASE_DIRECT_URL: {
    secret: true,
    description: "Conexion directa para migraciones.",
  },
  DATABASE_PROVIDER: { description: "Proveedor de base de datos." },
  DATABASE_POOL_MAX: { description: "Conexiones maximas del pool runtime." },
  DATABASE_MIGRATION_REQUIRE_COMPLETE: {
    description: "Exige migraciones completas al arrancar.",
  },
  DATABASE_PREPARE_REPORT: { description: "Reporte de preparacion de base." },
  DATABASE_RUNTIME_PASSWORD: {
    secret: true,
    description: "Clave del rol runtime.",
  },
  DATABASE_RUNTIME_TEST_PASSWORD: {
    secret: true,
    description: "Clave del rol runtime de test.",
  },
  DATABASE_RUNTIME_TEST_USER: { description: "Usuario del rol runtime de test." },
  DATABASE_EXPECTED_HOST: {
    requiredIn: ["prod", "stg"],
    roles: ["script"],
    description: "Host de base esperado en verificacion de entorno.",
  },
  DATABASE_ANALYTICS_PASSWORD: {
    secret: true,
    description: "Clave del rol de analitica.",
  },
  KOMANDA_BOOTSTRAP_RUNTIME_PASSWORD: {
    secret: true,
    roles: ["script"],
    description: "Clave inicial del rol runtime al preparar la base.",
  },
  CONFIRM_PRODUCTION_DATABASE_PREPARE: {
    secret: true,
    roles: ["script"],
    description: "Confirmacion explicita para preparar produccion.",
  },
} satisfies Record<string, VariableSpec>;

const storage = {
  OBJECT_STORAGE_ENDPOINT: { description: "Endpoint S3 compatible." },
  OBJECT_STORAGE_BUCKET: { description: "Bucket de medios." },
  OBJECT_STORAGE_REGION: { description: "Region del bucket." },
  OBJECT_STORAGE_ACCESS_KEY_ID: { secret: true, description: "Access key S3." },
  OBJECT_STORAGE_SECRET_ACCESS_KEY: {
    secret: true,
    description: "Secret key S3.",
  },
  OBJECT_STORAGE_FORCE_PATH_STYLE: { description: "Path style S3." },
  OBJECT_STORAGE_PUBLIC_BASE_URL: { description: "Base publica de medios." },
} satisfies Record<string, VariableSpec>;

const identity = {
  APP_ENCRYPTION_KEY_BASE64: {
    secret: true,
    requiredIn: ["prod", "stg"],
    description: "Clave de cifrado de 32 bytes en base64.",
  },
  APP_ENCRYPTION_KEY_VERSION: { description: "Version de la clave de cifrado." },
  IDENTITY_VERIFICATION_DELIVERY: {
    description: "Canal de entrega de verificacion (resend | http | capture).",
  },
  IDENTITY_VERIFICATION_CAPTURE_PATH: {
    description: "Ruta local de captura en desarrollo.",
  },
  IDENTITY_VERIFICATION_FROM_EMAIL: { description: "Remitente de verificacion." },
  IDENTITY_VERIFICATION_HTTP_ENDPOINT: {
    description: "Endpoint del proveedor HTTP.",
  },
  IDENTITY_VERIFICATION_HTTP_TOKEN: {
    secret: true,
    description: "Token del proveedor HTTP.",
  },
  IDENTITY_VERIFICATION_RESEND_KEY: {
    secret: true,
    description: "API key de Resend.",
  },
} satisfies Record<string, VariableSpec>;

const payments = {
  MERCADOPAGO_CLIENT_ID: { description: "Client ID de Mercado Pago." },
  MERCADOPAGO_CLIENT_SECRET: {
    secret: true,
    description: "Client secret de Mercado Pago.",
  },
  MERCADOPAGO_AUTHORIZATION_URL: { description: "URL de autorizacion OAuth." },
  MERCADOPAGO_API_BASE_URL: { description: "Base de la API de Mercado Pago." },
  MERCADOPAGO_REDIRECT_URI: { description: "Redirect URI OAuth." },
  MERCADOPAGO_WEBHOOK_SECRET: {
    secret: true,
    description: "Secreto de firma de webhooks.",
  },
  AFIPSDK_ACCESS_TOKEN: {
    secret: true,
    description: "Token de AFIP SDK.",
  },
  AFIPSDK_CUIT: { description: "CUIT emisor para AFIP." },
} satisfies Record<string, VariableSpec>;

const messaging = {
  KOMANDA_WHATSAPP_ACCESS_TOKEN: {
    secret: true,
    description: "Token de WhatsApp Cloud API.",
  },
  KOMANDA_WHATSAPP_PHONE_NUMBER_ID: {
    description: "Phone number ID de WhatsApp.",
  },
  KOMANDA_WHATSAPP_READY_TEMPLATE: { description: "Template de pedido listo." },
  KOMANDA_WHATSAPP_OWNER_CASH_TEMPLATE: {
    description: "Template de aviso al dueno.",
  },
} satisfies Record<string, VariableSpec>;

const jobs = {
  OUTBOX_DISPATCH_INTERVAL_MS: { description: "Espera entre rondas de outbox." },
  OUTBOX_DISPATCH_BATCH_SIZE: { description: "Eventos por ronda de outbox." },
  PAYMENT_RECONCILE_INTERVAL_MS: {
    description: "Espera entre rondas de conciliacion.",
  },
  PAYMENT_RECONCILE_THRESHOLD_SECONDS: {
    description: "Edad minima de un pago incierto.",
  },
  PAYMENT_RECONCILE_LIMIT: { description: "Intentos por ronda." },
  PRINT_INTENT_MAX_AGE_MINUTES: { description: "Antiguedad maxima de impresion." },
} satisfies Record<string, VariableSpec>;

export const variableRegistry = {
  ...core,
  ...telemetry,
  ...database,
  ...storage,
  ...identity,
  ...payments,
  ...messaging,
  ...jobs,
} satisfies Record<string, VariableSpec>;

export type VariableName = keyof typeof variableRegistry;

const registry = variableRegistry as Record<string, VariableSpec>;

function readSecretFiles(directory: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!directory || !existsSync(directory)) return values;

  const environmentFile = join(directory, `${resolveEnvironment()}.env`);
  if (existsSync(environmentFile) && statSync(environmentFile).isFile()) {
    for (const line of readFileSync(environmentFile, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^"(.*)"$/, "$1");
    }
  }

  for (const name of Object.keys(registry)) {
    const file = join(directory, name);
    if (existsSync(file) && statSync(file).isFile()) {
      values[name] = readFileSync(file, "utf8").trim();
    }
  }
  return values;
}

let loaded = false;

/**
 * Carga los secretos montados, sin pisar variables ya presentes, y valida el
 * contrato del entorno activo. Idempotente y sin efectos al importar el modulo.
 */
export function loadRuntimeConfig(options: { role?: RuntimeRole } = {}) {
  const environment = resolveEnvironment();
  const role = options.role ?? "web";

  if (!loaded) {
    const directory = process.env.KOMANDA_SECRETS_DIR?.trim() ?? "";
    if (directory) {
      for (const [name, value] of Object.entries(readSecretFiles(directory))) {
        if (!process.env[name]?.trim()) process.env[name] = value;
      }
    }
    loaded = true;
  }

  const problems: string[] = [];
  for (const [name, spec] of Object.entries(registry)) {
    if (spec.requiredIn?.includes(environment) && (!spec.roles || spec.roles.includes(role))) {
      if (!process.env[name]?.trim()) problems.push(`${name} is required in ${environment}.`);
    }
  }
  if (problems.length > 0) throw new ConfigurationError(problems);

  return environment;
}

function required(name: VariableName): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigurationError([`${name} is required.`]);
  return value;
}

function optional(name: VariableName): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function integer(name: VariableName, fallback: number): number {
  const parsed = Number.parseInt(optional(name) ?? "", 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function samplingRatio(): number {
  const raw = optional("OTEL_TRACES_SAMPLER_ARG");
  if (!raw) return 0.1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1;
}

/**
 * Acceso tipado. Los getters leen `process.env` en el momento de la llamada
 * para que los tests y los overrides operativos sigan siendo efectivos.
 */
export const config = {
  environment: (): Environment => resolveEnvironment(),
  isProduction: () => resolveEnvironment() === "prod",
  core: {
    publicBaseUrl: () => optional("KOMANDA_PUBLIC_BASE_URL"),
    siteUrl: () => optional("NEXT_PUBLIC_SITE_URL"),
    storefrontRootDomain: () => optional("STOREFRONT_ROOT_DOMAIN"),
    coreUrl: () => optional("KOMANDA_CORE_URL"),
    cronSecret: () => optional("CRON_SECRET"),
  },
  telemetry: {
    /** En `test` no se exporta a la red; el resto de entornos es obligatorio. */
    enabled: () => resolveEnvironment() !== "test",
    endpoint: () => optional("OTEL_EXPORTER_OTLP_ENDPOINT"),
    headers: () => optional("OTEL_EXPORTER_OTLP_HEADERS"),
    identifierKey: () => optional("KOMANDA_TELEMETRY_IDENTIFIER_KEY"),
    serviceName: () => optional("OTEL_SERVICE_NAME"),
    samplingRatio,
  },
  database: {
    url: () => optional("DATABASE_URL"),
    directUrl: () => optional("DATABASE_DIRECT_URL"),
    poolMax: () => integer("DATABASE_POOL_MAX", 10),
  },
  jobs: {
    outboxIntervalMs: () => integer("OUTBOX_DISPATCH_INTERVAL_MS", 2_000),
    outboxBatchSize: () => integer("OUTBOX_DISPATCH_BATCH_SIZE", 25),
    reconcileIntervalMs: () => integer("PAYMENT_RECONCILE_INTERVAL_MS", 30_000),
    reconcileLimit: () => integer("PAYMENT_RECONCILE_LIMIT", 50),
  },
};

/** Solo para diagnostico: nombres y estado, nunca valores ni secretos. */
export function describeConfiguration() {
  const environment = resolveEnvironment();
  return {
    environment,
    variables: Object.entries(registry).map(([name, spec]) => ({
      name,
      secret: Boolean(spec.secret),
      required: Boolean(spec.requiredIn?.includes(environment)),
      configured: Boolean(process.env[name]?.trim()),
    })),
  };
}

/** Uso interno/tests: permite recargar archivos de secretos. */
export function resetConfigurationCache() {
  loaded = false;
}

export { required as requiredVariable };
