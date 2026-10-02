import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Invariante de disponibilidad del menú (docs/base-de-datos.md §7.2).
 *
 * El menú y el directorio público son la razón de ser del producto: un tenant
 * que no muestra su carta es un local cerrado. Ese camino de lectura no puede
 * depender de las tablas de pedidos, pagos, carritos ni impresión, porque esas
 * viven en la misma instancia y comparten pool con el checkout. Si el camino
 * público toca una tabla de proceso, un pico de venta o una tabla bloqueada se
 * lleva puestos a todos los locales a la vez.
 */

/** T0 — identidad y catálogo (docs/base-de-datos.md §7.1). */
const T0_TABLES = [
  "addon_groups",
  "addon_options",
  "catalog_categories",
  "catalog_combos",
  "catalog_items",
  "combo_items",
  "discount_categories",
  "discount_items",
  "discounts",
  "global_product_catalog",
  "integration_accounts",
  "inventory_levels",
  "item_addon_groups",
  "media_assets",
  "plan_definitions",
  "tenant_entitlement_snapshots",
  "tenant_locations",
  "tenant_memberships",
  "tenant_settings",
  "tenants",
  "users",
] as const;

/** T1 — ledger financiero. Nunca se borra; su caída es un incidente contable. */
const T1_TABLES = [
  "audit_events",
  "billing_documents",
  "cash_register_movements",
  "cash_shifts",
  "discount_redemptions",
  "idempotency_records",
  "inventory_movements",
  "mp_financial_records",
  "order_events",
  "order_lines",
  "order_line_options",
  "orders",
  "outbox_events",
  "payment_attempts",
  "webhook_events",
] as const;

/** T2 — estado efímero de proceso. Descartable. */
const T2_TABLES = [
  "cart_line_options",
  "cart_lines",
  "carts",
  "catalog_search_entries",
  "identity_verification_challenges",
  "onboarding_handoffs",
  "print_agent_pairings",
  "print_agents",
  "print_jobs",
  "print_job_attempts",
  "printer_destinations",
  "provider_resource_routes",
  "public_search_tenants",
  "storefront_item_events",
  "storefront_sessions",
  "tenant_counters",
  "user_sessions",
] as const;

const T0 = new Set<string>(T0_TABLES);
const FORBIDDEN = new Set<string>([...T1_TABLES, ...T2_TABLES]);

const PUBLIC_READ_ENTRY_POINTS = [
  "features/tenancy/application/public-tenant.service",
] as const;

/** Módulos que el camino público puede importar sin dejar de estar escaneados. */
const SCAN_FEATURE_ROOT = "features";

/** Máximo de lecturas por tenant que tolera el directorio público. */
const MAX_READS_PER_TENANT = 6;

/** Quita comentarios sin tocar strings ni template literals de SQL. */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Enumera cada tabla declarada en el schema, como { drizzleId, postgresName }. */
async function schemaTables() {
  const dir = resolve(process.cwd(), "db/schema");
  const tables: { drizzleId: string; postgresName: string }[] = [];
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".ts")) continue;
    const source = await readFile(resolve(dir, file), "utf8");
    const pattern = /export const (\w+) = pgTable\(\s*"(\w+)"/g;
    for (const match of source.matchAll(pattern)) {
      tables.push({ drizzleId: match[1], postgresName: match[2] });
    }
  }
  return tables;
}

/** Resuelve un specifier de import a una ruta relativa a la raíz de src. */
function resolveImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  return resolve(process.cwd(), dirname(fromFile), specifier)
    .replace(process.cwd() + "/", "")
    .replace(/\.ts$/, "");
}

/** Sigue imports relativos/alias dentro de features/ y devuelve el conjunto alcanzable. */
async function reachableFrom(entry: string) {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    let source: string;
    try {
      source = await readFile(resolve(process.cwd(), `${current}.ts`), "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const resolved = resolveImport(current, match[1]);
      if (resolved && resolved.startsWith(SCAN_FEATURE_ROOT)) queue.push(resolved);
    }
  }
  return seen;
}

/** Devuelve la región de un método delimitada por conteo de llaves. Falla si no existe. */
function methodRegion(source: string, signature: RegExp, label: string) {
  const start = source.search(signature);
  if (start < 0) {
    throw new Error(
      `No se encontró "${label}" con la firma esperada. El test mide sobre código que cambió de forma: actualizá la aserción a propósito, no por accidente.`,
    );
  }
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`Región de "${label}" sin llave de cierre.`);
}

/**
 * Cada forma en que el código puede nombrar una tabla: una llamada del builder de
 * Drizzle (`.from(x)`, `.leftJoin(x)`, …), SQL crudo (`from tabla`), o el
 * identificador importado y usado en cualquier otra forma. Se resuelve todo
 * contra el mapa real del schema, porque el nombre de Drizzle y el de PostgreSQL
 * no siempre coinciden: `tenantOrders` es la tabla `orders`.
 */
function referencedIdentifiers(code: string): string[] {
  const found = new Set<string>();
  const builderCalls =
    /\.(?:from|insert|update|delete|leftJoin|innerJoin|rightJoin|fullJoin)\(\s*([A-Za-z_]\w*)/g;
  for (const match of code.matchAll(builderCalls)) found.add(match[1]);
  for (const match of code.matchAll(/\bfrom\s+([a-z][a-z0-9_]*)\b/g)) found.add(match[1]);
  for (const match of code.matchAll(/\b([a-z][a-z0-9]*_[a-z0-9_]+)\b/g)) found.add(match[1]);
  for (const match of code.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s*["']@\/db\/schema["']/g)) {
    for (const name of match[1].split(",")) {
      const identifier = name.trim().split(/\s+as\s+/)[0].trim();
      if (identifier) found.add(identifier);
    }
  }
  return [...found];
}

describe("menu availability invariant", () => {
  it("clasifica todas las tablas del schema en T0 o en proceso", async () => {
    const tables = await schemaTables();
    const unclassified = tables
      .map((t) => t.postgresName)
      .filter((name) => !T0.has(name) && !FORBIDDEN.has(name));

    expect(
      unclassified,
      "Hay tablas del schema sin clasificar en este test. Agregala a T0_TABLES o a T1/T2_TABLES según docs/base-de-datos.md §7.1, para que el invariante siga siendo verificable.",
    ).toEqual([]);
    expect(tables.length).toBeGreaterThan(0);
  });

  it("la allowlist T0 y la lista de proceso no se solapan", () => {
    const overlap = [...T0].filter((name) => FORBIDDEN.has(name));
    expect(overlap).toEqual([]);
  });

  it("las listas del test coinciden con los nombres reales del schema", async () => {
    const tables = await schemaTables();
    const realNames = new Set(tables.map((t) => t.postgresName));
    const invented = [...T0, ...FORBIDDEN].filter((name) => !realNames.has(name));

    expect(
      invented,
      "El test nombra tablas que no existen en db/schema. Un nombre inventado nunca dispara y deja la tabla real sin cubrir.",
    ).toEqual([]);
  });

  it("el camino público no lee ninguna tabla de proceso, siguiendo sus imports", async () => {
    const tables = await schemaTables();
    const postgresNameOf = new Map<string, string>();
    for (const { drizzleId, postgresName } of tables) postgresNameOf.set(drizzleId, postgresName);

    const files = await reachableFrom(PUBLIC_READ_ENTRY_POINTS[0]);
    const violations: string[] = [];

    for (const file of [...files].sort()) {
      const code = stripComments(
        await readFile(resolve(process.cwd(), `${file}.ts`), "utf8"),
      );
      for (const identifier of referencedIdentifiers(code)) {
        // Un identificador Drizzle se resuelve por el mapa; un nombre en
        // snake_case se compara directo contra el schema.
        const postgresName = postgresNameOf.get(identifier) ?? identifier;
        const isRealTable = tables.some((t) => t.postgresName === postgresName);
        if (isRealTable && FORBIDDEN.has(postgresName)) {
          violations.push(`${file}: ${identifier} (${postgresName})`);
        }
      }
    }

    expect(
      violations,
      "Una tabla de T1/T2 apareció en el camino público, posiblemente vía SQL crudo o un módulo importado. Un incidente en esa tabla apagaría la carta de todos los tenants. Ver docs/base-de-datos.md §7.2.",
    ).toEqual([]);
  });

  it("listActiveDirectory no supera las lecturas por tenant", async () => {
    const source = await readFile(
      resolve(process.cwd(), `${PUBLIC_READ_ENTRY_POINTS[0]}.ts`),
      "utf8",
    );
    const region = methodRegion(source, /^\s*async listActiveDirectory\(/m, "listActiveDirectory");

    const readiness = await readFile(
      resolve(process.cwd(), "features/tenancy/application/tenant-readiness.service.ts"),
      "utf8",
    );
    const readinessRegion = methodRegion(
      readiness,
      /^export async function fetchTenantReadiness\(/m,
      "fetchTenantReadiness",
    );

    const loop = region.slice(region.indexOf("for (const tenant of"));
    expect(loop.length, "No se encontró el bucle por tenant en listActiveDirectory.").toBeGreaterThan(0);

    const readsInLoop = new Set(
      [...loop.matchAll(/\.(?:from|leftJoin|innerJoin)\(\s*([A-Za-z_]\w*)/g)].map((m) => m[1]),
    );
    const readinessReads = new Set(
      [...readinessRegion.matchAll(/\.from\(\s*([A-Za-z_]\w*)/g)].map((m) => m[1]),
    );

    const perTenant = new Set([...readsInLoop, ...readinessReads]);
    expect(
      perTenant.size,
      `listActiveDirectory pasó a ${perTenant.size} lecturas por tenant. Si agregaste una, materializá el dato en tenants en vez de consultarlo N veces (BL-8). Si la sacaste, actualizá este número a propósito: menos es mejor y el objetivo sigue vigente.`,
    ).toBeLessThanOrEqual(MAX_READS_PER_TENANT);
  });
});