import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateOrderService } from "@/features/orders/application/create-order.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import type { TenantContext } from "@/lib/tenant-context/types";

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn(async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => {
    return callback({});
  }),
}));

vi.mock("@/features/orders/infrastructure/order.repository", () => {
  return {
    OrderRepository: class {
      async loadCart() {
        return {
          id: "cart-123",
          status: "validated",
          lines: [{ id: "line-1" }],
        };
      }
      async createFromCartSnapshot() {
        return {
          order: {
            id: "order-123",
            purchaseNumber: "1",
            source: "admin_direct",
            fulfillmentStatus: "approved",
            paymentStatus: "pending",
            locationId: "loc-123",
            customer: { name: "Cliente Test" },
          },
          created: true,
        };
      }
    },
    OrderNotFoundError: class extends Error {},
    OrderConflictError: class extends Error {},
  };
});

vi.mock("@/lib/audit/audit.service", () => ({
  appendAuditEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/outbox/outbox.service", () => ({
  appendOutboxEvent: vi.fn(async () => {}),
}));

const mockEnqueue = vi.fn(async () => {});
vi.mock("@/features/printing/application/print-job.service", () => ({
  PrintJobService: class {
    enqueueOrderTicketInTransaction = mockEnqueue;
  },
}));

const mockIssueDocument = vi.fn(async () => ({}));
vi.mock("@/features/billing/infrastructure/billing.repository", () => ({
  BillingRepository: class {
    issueDocument = mockIssueDocument;
  },
}));

describe("Create order atomicity and admin direct order contracts", () => {
  const mockContext: TenantContext = createVerifiedTenantContext({
    tenantId: "tenant-uuid-123",
    correlationId: "corr-123",
    source: "administrative",
    actor: {
      kind: "user",
      userId: "user-123",
      membershipId: "member-123",
      role: "owner",
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueue.mockResolvedValue(undefined);
    mockIssueDocument.mockResolvedValue({});
  });

  it("completes order creation and issues billing document atomically when successful", async () => {
    const service = new CreateOrderService();
    const order = await service.createDirect(
      mockContext,
      {
        cartId: "00000000-0000-4000-8000-000000000001",
        customer: { name: "Cliente Test" },
      },
      "00000000-0000-4000-8000-000000000011",
    );

    expect(order.id).toBe("order-123");
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockIssueDocument).toHaveBeenCalledTimes(1);
  });

  it("rejects without returning ghost order if billing document issuance fails", async () => {
    mockIssueDocument.mockRejectedValueOnce(
      new Error('relation "billing_documents" does not exist'),
    );

    const service = new CreateOrderService();
    await expect(
      service.createDirect(
        mockContext,
        {
          cartId: "00000000-0000-4000-8000-000000000001",
          customer: { name: "Cliente Test" },
        },
        "00000000-0000-4000-8000-000000000012",
      ),
    ).rejects.toThrow('relation "billing_documents" does not exist');
  });

  it("rejects without returning ghost order if printing enqueue fails", async () => {
    mockEnqueue.mockRejectedValueOnce(
      new Error("Failed to enqueue print job"),
    );

    const service = new CreateOrderService();
    await expect(
      service.createDirect(
        mockContext,
        {
          cartId: "00000000-0000-4000-8000-000000000001",
          customer: { name: "Cliente Test" },
        },
        "00000000-0000-4000-8000-000000000013",
      ),
    ).rejects.toThrow("Failed to enqueue print job");
  });

  it("ensures create-order service has no console.warn or swallowed catch blocks", async () => {
    const source = await readFile(
      "features/orders/application/create-order.service.ts",
      "utf8",
    );

    expect(source).not.toContain("console.warn");
    expect(source).not.toContain("Failed to issue billing document");
    expect(source).not.toContain("Failed to enqueue print job");
  });

  it("ensures AdminDirectOrderForm navigates to admin orders list with confirmation param", async () => {
    const source = await readFile(
      "features/orders/web/AdminDirectOrderForm.tsx",
      "utf8",
    );

    expect(source).toContain("/admin/${tenantId}/orders?created=");
    expect(source).not.toContain("/checkout/pay/success");
  });

  it("ensures shop checkout pay success page removed dead admin_direct branch", async () => {
    const source = await readFile(
      "app/(shop)/checkout/pay/success/page.tsx",
      "utf8",
    );

    expect(source).not.toContain("admin_direct");
    expect(source).not.toContain("admin-direct");
  });
});
