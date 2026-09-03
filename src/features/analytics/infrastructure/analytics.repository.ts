import { and, eq, gte, lte, sql } from "drizzle-orm";
import { storefrontSessions } from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import type { RecordStorefrontSessionInput } from "../domain/analytics.schemas";

export class AnalyticsRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
  ) {}

  async upsertSession(input: RecordStorefrontSessionInput) {
    const [row] = await this.transaction
      .insert(storefrontSessions)
      .values({
        tenantId: this.tenantId,
        sessionKey: input.sessionKey,
        deviceType: input.deviceType,
        dwellTimeSeconds: input.dwellTimeSeconds,
        categoryDwellMap: input.categoryDwellMap,
        itemViewsMap: input.itemViewsMap,
        cartCreated: input.cartCreated,
        orderPlaced: input.orderPlaced,
        associatedOrderId: input.associatedOrderId ?? null,
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [storefrontSessions.tenantId, storefrontSessions.sessionKey],
        set: {
          dwellTimeSeconds: sql`greatest(${storefrontSessions.dwellTimeSeconds}, ${input.dwellTimeSeconds})`,
          deviceType: input.deviceType !== "unknown" ? input.deviceType : storefrontSessions.deviceType,
          categoryDwellMap: input.categoryDwellMap,
          itemViewsMap: input.itemViewsMap,
          cartCreated: sql`${storefrontSessions.cartCreated} or ${input.cartCreated}`,
          orderPlaced: sql`${storefrontSessions.orderPlaced} or ${input.orderPlaced}`,
          associatedOrderId: sql`coalesce(${input.associatedOrderId ?? null}, ${storefrontSessions.associatedOrderId})`,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  }

  async getDwellMetrics(from: Date, to: Date) {
    const result = await this.transaction
      .select({
        totalSessions: sql<number>`count(*)::int`,
        avgDwellSeconds: sql<number>`coalesce(round(avg(${storefrontSessions.dwellTimeSeconds})), 0)::int`,
        maxDwellSeconds: sql<number>`coalesce(max(${storefrontSessions.dwellTimeSeconds}), 0)::int`,
        bounceSessions: sql<number>`count(*) filter (where ${storefrontSessions.dwellTimeSeconds} < 5)::int`,
        cartCreatedSessions: sql<number>`count(*) filter (where ${storefrontSessions.cartCreated} = true)::int`,
        orderPlacedSessions: sql<number>`count(*) filter (where ${storefrontSessions.orderPlaced} = true)::int`,
      })
      .from(storefrontSessions)
      .where(
        and(
          eq(storefrontSessions.tenantId, this.tenantId),
          gte(storefrontSessions.createdAt, from),
          lte(storefrontSessions.createdAt, to),
        ),
      );

    const metrics = result[0] ?? {
      totalSessions: 0,
      avgDwellSeconds: 0,
      maxDwellSeconds: 0,
      bounceSessions: 0,
      cartCreatedSessions: 0,
      orderPlacedSessions: 0,
    };

    const bounceRate = metrics.totalSessions > 0
      ? Number(((metrics.bounceSessions / metrics.totalSessions) * 100).toFixed(1))
      : 0;

    const conversionRate = metrics.totalSessions > 0
      ? Number(((metrics.orderPlacedSessions / metrics.totalSessions) * 100).toFixed(1))
      : 0;

    return {
      ...metrics,
      bounceRate,
      conversionRate,
    };
  }

  async getDwellTimeline(from: Date, to: Date, granularity: "hour" | "day" = "day") {
    const dateTruncField = granularity === "hour" ? "hour" : "day";
    const bucketSql = sql<string>`to_char(date_trunc(${dateTruncField}, ${storefrontSessions.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

    const rows = await this.transaction
      .select({
        bucket: bucketSql,
        sessions: sql<number>`count(*)::int`,
        avgDwellSeconds: sql<number>`coalesce(round(avg(${storefrontSessions.dwellTimeSeconds})), 0)::int`,
        orders: sql<number>`count(*) filter (where ${storefrontSessions.orderPlaced} = true)::int`,
      })
      .from(storefrontSessions)
      .where(
        and(
          eq(storefrontSessions.tenantId, this.tenantId),
          gte(storefrontSessions.createdAt, from),
          lte(storefrontSessions.createdAt, to),
        ),
      )
      .groupBy(sql`date_trunc(${dateTruncField}, ${storefrontSessions.createdAt})`)
      .orderBy(sql`date_trunc(${dateTruncField}, ${storefrontSessions.createdAt}) asc`);

    return rows;
  }
}
