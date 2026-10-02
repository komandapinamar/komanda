import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Invariante de disponibilidad del menú.
 *
 * El menú y el directorio público son la razón de ser del producto: un tenant
 * que no muestra su carta es un local cerrado. Ese camino de lectura no puede
 * depender de las tablas de pedidos, pagos, carritos ni impresión, porque esas
 * viven en la misma instancia y comparten pool con el checkout. Si el camino
 * público toca una tabla de proceso, un pico de venta o una tabla bloqueada se
 * lleva puestos a todos los locales a la vez.
 *
 * Ver docs/base-de-datos.md §7.2. El desarrollo completo de la separación física
 * está en §7.4.
 */

/**
 * Tablas que el camino público PUEDE leer. Todas pertenecen al tier T0
 * (identidad y catálogo) según docs/base-de-datos.md §7.1.
 */
const T0_ALLOWLIST = new Set([
  "tenants",
  "tenantLocations",
  "tenantSettings",
  "catalogCategories",
  "catalogItems",
  "catalogCombos",
  "comboItems",
  "addonGroups",
  "addonOptions",
  "itemAddonGroups",
  "mediaAssets",
  "integrationAccounts",
]);

/**
 * Tablas de proceso que el camino público JAMÁS debe tocar. Cada una pertenece
 * a T1 o T2, y su sola presencia acá significa que un incidente de esa tabla
 * apaga el menú de todos los tenants.
 */
const FORBIDDEN_PROCESS_TABLES = new Set([
  "tenantOrders",
  "orderLines",
  "orderLineOptions",
  "orderEvents",
  "paymentAttempts",
  "carts",
  "cartLines",
  "cartLineOptions",
  "cashShifts",
  "cashRegisterMovements",
  "billingDocuments",
  "mpFinancialRecords",
  "printJobs",
  "printJobAttempts",
  "printAgents",
  "printAgentPairings",
  "outboxEvents",
  "webhookEvents",
  "auditEvents",
  "storefrontSessions",
  "storefrontItemEvents",
  "idempotencyRecords",
]);

const PUBLIC_READ_PATH = [
  "features/tenancy/application/public-tenant.service.ts",
  "features/tenancy/application/tenant-readiness.service.ts",
] as const;

async function readPublicReadPath() {
  const entries = await Promise.all(
    PUBLIC_READ_PATH.map(async (file) => [file, await readFile(file, "utf8")] as const),
  );
  return entries;
}

function tablesReadIn(source: string, file: string) {
  const reads = new Set<string>();
  const patterns = [/\.from\((\w+)\)/g, /\.insert\((\w+)\)/g, /\.update\((\w+)\)/g];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      reads.add(`${file}:${match[1]}`);
    }
  }
  return [...reads];
}

describe("menu availability invariant", () => {
  it("el camino público de lectura solo toca tablas del tier T0", async () => {
    const files = await readPublicReadPath();
    const allowed = new Set([...T0_ALLOWLIST].map((t) => t));
    const violations: string[] = [];

    for (const [file, source] of files) {
      for (const entry of tablesReadIn(source, file)) {
        const table = entry.split(":")[1];
        if (!allowed.has(table)) violations.push(entry);
      }
    }

    expect(
      violations,
      "El menú o el directorio leen una tabla fuera de T0. Un incidente en esa tabla apagaría la carta de todos los tenants. Ver docs/base-de-datos.md §7.2.",
    ).toEqual([]);
  });

  it("ninguna tabla de proceso aparece en el camino público", async () => {
    const files = await readPublicReadPath();
    const forbiddenHits: string[] = [];

    for (const [file, source] of files) {
      for (const table of FORBIDDEN_PROCESS_TABLES) {
        // Busca la tabla por su identificador Drizzle, no por substring de texto.
        if (new RegExp(`\\b${table}\\b`).test(source)) {
          forbiddenHits.push(`${file}:${table}`);
        }
      }
    }

    expect(
      forbiddenHits,
      "Una tabla de T1/T2 se filtró al camino público. Esa dependencia convierte cualquier incidente de pedidos o pagos en una caída del menú.",
    ).toEqual([]);
  });

  it("la allowlist T0 y la lista prohibida no se solapan", () => {
    const overlap = [...FORBIDDEN_PROCESS_TABLES].filter((t) => T0_ALLOWLIST.has(t));
    expect(overlap).toEqual([]);
  });

  /**
   * `listActiveDirectory` recorre todos los tenants dentro de UNA transacción y
   * ejecuta 6 selects por local: los 5 de `fetchTenantReadiness` (tenants,
   * tenant_locations, catalog_items, integration_accounts, tenant_settings) más
   * catalog_categories, además del select inicial de tenants que corre una sola
   * vez. Es lineal y hoy es el camino más caro del sistema: medido en local sin
   * carga, 1 tenant = 25ms, 10 = 39ms, 50 = 147ms.
   *
   * Este test no prohíbe el patrón (arreglarlo es BL-8: materializar
   * orderingAvailable en `tenants`), pero congela el número para que cualquier
   * query nueva por tenant sea una decisión visible y no un accidente.
   */
  it("listActiveDirectory se mantiene en 6 lecturas por tenant", async () => {
    const source = await readFile(
      "features/tenancy/application/public-tenant.service.ts",
      "utf8",
    );
    const directoryBody = source.slice(
      source.indexOf("async listActiveDirectory"),
      source.indexOf("async resolve"),
    );
    const readiness = await readFile(
      "features/tenancy/application/tenant-readiness.service.ts",
      "utf8",
    );
    const readinessBody = readiness.slice(
      readiness.indexOf("export async function fetchTenantReadiness"),
      readiness.indexOf("export class TenantReadinessService"),
    );

    // fetchTenantReadiness: 5 selects, todos ejecutados por tenant.
    const readinessReads = [...readinessBody.matchAll(/\.from\((\w+)\)/g)].map((m) => m[1]);
    // listActiveDirectory: 1 select global (tenants) + 1 por tenant (catalog_categories).
    const directoryReads = [...directoryBody.matchAll(/\.from\((\w+)\)/g)].map((m) => m[1]);

    const perTenant = readinessReads.length + (directoryReads.length - 1);
    expect(
      perTenant,
      `listActiveDirectory pasó a ${perTenant} lecturas por tenant. Si agregaste una, considerá materializar el dato en tenants en vez de consultarlo N veces.`,
    ).toBe(6);
    expect(readinessReads.length).toBe(5);
    expect(directoryReads.length).toBe(2);
  });
});
