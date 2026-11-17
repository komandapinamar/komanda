import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Guards the operation names the dashboards and TraceQL queries depend on.
 * Helper-level tests cannot prove that a real service path is still wrapped.
 */
const wrapped = [
  ["features/orders/application/create-order.service.ts", ["order.create_direct", "order.create_items", "order.create_paid"]],
  ["features/orders/application/collect-cash.service.ts", ["payment.collect_cash"]],
  ["features/payments/application/mercadopago-webhook.service.ts", ["payment.webhook"]],
  ["features/payments/application/payment-reconciliation.service.ts", ["payment.reconcile"]],
  ["features/printing/application/print-job.service.ts", ["print.claim", "print.report", "print.enqueue"]],
  ["lib/outbox/outbox-dispatcher.ts", ["outbox.deliver"]],
] as const;

describe("operation instrumentation coverage", () => {
  it.each(wrapped)("wraps %s with its documented span name", async (file, operations) => {
    const source = await readFile(file, "utf8");
    for (const operation of operations) {
      expect(source).toContain(`observeOperation("${operation}"`);
    }
  });
});
