import { eq } from "drizzle-orm";
import { z } from "zod";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { tenants } from "@/db/schema";
import { PrintAgentService } from "@/features/printing/application/print-agent.service";
import { PrintJobRepository } from "@/features/printing/infrastructure/print-job.repository";
import type { OrderView } from "@/features/orders/infrastructure/order.repository";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import { createVerifiedTenantContext, type TenantContext } from "@/lib/tenant-context/types";

const printJobResultSchema = z
  .object({
    status: z.enum(["printed", "failed"]),
    attemptNumber: z.number().int().positive(),
    errorCode: z.string().trim().max(120).optional(),
    errorMessage: z.string().trim().max(500).optional(),
  })
  .strict();

export class PrintJobNotFoundError extends Error {}
export class PrintJobConflictError extends Error {}

export class PrintJobService {
  constructor(private readonly agents = new PrintAgentService()) {}

  async agentContextFromToken(token: string, correlationId: string) {
    const agent = await this.agents.resolveToken(token);
    return createVerifiedTenantContext({
      tenantId: agent.tenantId,
      locationId: agent.locationId,
      correlationId,
      source: "agent",
      actor: {
        kind: "agent",
        agentId: agent.agentId,
        locationId: agent.locationId,
      },
    });
  }

  async claim(token: string, correlationId: string) {
    const context = await this.agentContextFromToken(token, correlationId);
    return withTenantTransaction(context, (transaction) =>
      new PrintJobRepository(transaction, context).claimNext(),
    );
  }

  async reportResult(input: {
    token: string;
    correlationId: string;
    jobId: string;
    idempotencyKey: string;
    body: unknown;
  }) {
    const request = printJobResultSchema.parse(input.body);
    const context = await this.agentContextFromToken(input.token, input.correlationId);
    return withTenantTransaction(context, async (transaction) => {
      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: context.tenantId,
        scope: `print-result:${input.jobId}:${request.attemptNumber}`,
        key: input.idempotencyKey,
        request,
        retentionSeconds: 7 * 24 * 60 * 60,
      });
      if (claim.replayed) {
        return claim.body;
      }

      const job = await new PrintJobRepository(transaction, context).reportResult({
        jobId: input.jobId,
        attemptNumber: request.attemptNumber,
        status: request.status,
        errorCode: request.errorCode,
        errorMessage: request.errorMessage,
      });
      if (!job) {
        throw new PrintJobNotFoundError("Print job not found.");
      }
      const response = {
        jobId: job.id,
        status: job.status,
        attemptNumber: job.attemptCount,
        printedAt: job.printedAt?.toISOString() ?? null,
        nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
      };
      await idempotency.complete(claim.recordId, 200, response);
      return response;
    });
  }

  async enqueueOrderTicketInTransaction(
    transaction: TenantTransaction,
    context: TenantContext,
    order: OrderView,
  ) {
    const repository = new PrintJobRepository(transaction, context);
    if (!(await repository.tenantPrintingEnabled())) {
      return null;
    }
    const [tenant] = await transaction
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, context.tenantId))
      .limit(1);
    return repository.create({
      locationId: order.locationId,
      orderId: order.id,
      idempotencyKey: `order:${order.id}:kitchen-ticket`,
      payload: buildTicketPayload(order, tenant?.name),
    });
  }
}

function buildTicketPayload(order: OrderView, tenantName?: string) {
  return {
    orderId: order.id,
    purchaseNumber: order.purchaseNumber,
    source: order.source,
    copies: order.source === "admin_direct" ? 2 : 1,
    tenant: tenantName ?? "Komanda",
    customer: order.customer,
    notes: order.notes ?? undefined,
    currency: order.currency,
    amount: order.total,
    approvedAt: order.approvedAt ?? order.createdAt,
    items: order.lines.map((line) => ({
      id: line.sourceItemId ?? line.sourceComboId ?? line.id,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      note: line.note ?? undefined,
      options: line.options.map((option) => ({
        name: option.name,
        priceDelta: option.priceDelta,
        quantity: option.quantity,
      })),
    })),
    summary: {
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      total: order.total,
    },
  };
}
