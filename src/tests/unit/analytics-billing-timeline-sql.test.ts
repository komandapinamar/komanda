import { describe, expect, it } from "vitest";
import { AnalyticsRepository } from "@/features/analytics/infrastructure/analytics.repository";
import { BillingRepository } from "@/features/billing/infrastructure/billing.repository";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type QueryWithSql = {
  toSQL: () => { sql: string; params: unknown[] };
};

describe("analytics & billing timeline query SQL generation", () => {
  function createCapturingTx() {
    const pool = new Pool();
    const db = drizzle(pool);
    let capturedQuery: QueryWithSql | null = null;

    function wrap<T extends object>(obj: T): T {
      return new Proxy(obj, {
        get(target, prop, receiver) {
          if (prop === "then") {
            capturedQuery = target as unknown as QueryWithSql;
            return undefined;
          }
          const val = Reflect.get(target, prop, receiver);
          if (typeof val === "function") {
            return (...args: unknown[]) => {
              const res = Reflect.apply(val, target, args);
              capturedQuery = res as unknown as QueryWithSql;
              return wrap(res as object);
            };
          }
          return val;
        },
      });
    }

    const tx = {
      select: (fields?: unknown) => wrap(db.select(fields as never)),
    } as unknown as TenantTransaction;

    return {
      tx,
      getQuery: () => capturedQuery,
    };
  }

  it("generates matching literal date_trunc in select and group by for dwell timeline", async () => {
    const { tx, getQuery } = createCapturingTx();
    const repo = new AnalyticsRepository(tx, "tenant-test-123");
    const from = new Date("2026-09-05T00:00:00Z");
    const to = new Date("2026-09-12T00:00:00Z");

    try {
      await repo.getDwellTimeline(from, to, "day");
    } catch {
      // Expected uncaught resolution since pool is empty
    }

    const query = getQuery();
    expect(query).not.toBeNull();
    const { sql, params } = query!.toSQL();

    expect(sql).toContain("to_char(date_trunc('day', \"storefront_sessions\".\"created_at\")");
    expect(sql).toContain("group by date_trunc('day', \"storefront_sessions\".\"created_at\")");
    expect(sql).toContain("order by date_trunc('day', \"storefront_sessions\".\"created_at\") asc");

    expect(params).not.toContain("day");
    expect(params).toContain("tenant-test-123");
  });

  it("supports hour granularity for dwell timeline without parameterized unit", async () => {
    const { tx, getQuery } = createCapturingTx();
    const repo = new AnalyticsRepository(tx, "tenant-test-123");
    const from = new Date("2026-09-12T00:00:00Z");
    const to = new Date("2026-09-12T23:59:59Z");

    try {
      await repo.getDwellTimeline(from, to, "hour");
    } catch {}

    const query = getQuery();
    expect(query).not.toBeNull();
    const { sql, params } = query!.toSQL();

    expect(sql).toContain("to_char(date_trunc('hour', \"storefront_sessions\".\"created_at\")");
    expect(sql).toContain("group by date_trunc('hour', \"storefront_sessions\".\"created_at\")");
    expect(params).not.toContain("hour");
  });

  it("generates matching literal date_trunc in select and group by for revenue timeline", async () => {
    const { tx, getQuery } = createCapturingTx();
    const repo = new BillingRepository(tx, "tenant-test-123");
    const from = new Date("2026-09-05T00:00:00Z");
    const to = new Date("2026-09-12T00:00:00Z");

    try {
      await repo.getRevenueTimeline(from, to, "day");
    } catch {}

    const query = getQuery();
    expect(query).not.toBeNull();
    const { sql, params } = query!.toSQL();

    expect(sql).toContain("to_char(date_trunc('day', \"orders\".\"created_at\")");
    expect(sql).toContain("group by date_trunc('day', \"orders\".\"created_at\")");
    expect(sql).toContain("order by date_trunc('day', \"orders\".\"created_at\") asc");
    expect(params).not.toContain("day");
    expect(params).toContain("tenant-test-123");
  });
});
