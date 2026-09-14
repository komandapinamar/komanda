import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { TenantContext } from "@/lib/tenant-context/types";

export type TenantTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type PlatformServiceContext = {
  serviceId: string;
  correlationId: string;
};

export async function setTenantTransactionContext(
  transaction: TenantTransaction,
  tenantId: string,
) {
  await transaction.execute(
    sql`select set_config('app.tenant_id', ${tenantId}, true)`,
  );
}

export async function withPlatformServiceTransaction<T>(
  context: PlatformServiceContext,
  callback: (transaction: TenantTransaction) => Promise<T>,
) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select
        set_config('app.tenant_id', '', true),
        set_config('app.user_id', '', true),
        set_config('app.service_id', ${context.serviceId}, true),
        set_config('app.agent_id', '', true),
        set_config('app.correlation_id', ${context.correlationId}, true)`,
    );
    return callback(transaction);
  });
}

export async function withIdentityTransaction<T>(
  input: {
    userId?: string;
    sessionTokenDigest?: string;
    tenantId?: string;
    correlationId: string;
  },
  callback: (transaction: TenantTransaction) => Promise<T>,
) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select
        set_config('app.tenant_id', ${input.tenantId ?? ""}, true),
        set_config('app.user_id', ${input.userId ?? ""}, true),
        set_config('app.service_id', '', true),
        set_config('app.agent_id', '', true),
        set_config('app.session_token_digest', ${input.sessionTokenDigest ?? ""}, true),
        set_config('app.correlation_id', ${input.correlationId}, true)`,
    );
    return callback(transaction);
  });
}

function actorSettings(context: TenantContext) {
  switch (context.actor.kind) {
    case "user":
      return { userId: context.actor.userId, serviceId: "", agentId: "" };
    case "service":
      return { userId: "", serviceId: context.actor.serviceId, agentId: "" };
    case "agent":
      return { userId: "", serviceId: "", agentId: context.actor.agentId };
    case "system":
      return { userId: "", serviceId: context.actor.process, agentId: "" };
    case "anonymous":
      return { userId: "", serviceId: "", agentId: "" };
  }
}

export async function withTenantTransaction<T>(
  context: TenantContext,
  callback: (transaction: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (transaction) => {
    const actor = actorSettings(context);

    await transaction.execute(
      sql`select
        set_config('app.tenant_id', ${context.tenantId}, true),
        set_config('app.user_id', ${actor.userId}, true),
        set_config('app.service_id', ${actor.serviceId}, true),
        set_config('app.agent_id', ${actor.agentId}, true),
        set_config('app.correlation_id', ${context.correlationId}, true)`,
    );

    return callback(transaction);
  });
}
