import { describe, expect, it, vi, beforeEach } from "vitest";
import { getTableName, is } from "drizzle-orm";
import { PgTable, isPgView } from "drizzle-orm/pg-core";
import { TenantDeletionService } from "@/features/tenancy/application/tenant-deletion.service";
import * as schema from "@/db/schema";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import { TenantAccessDeniedError } from "@/features/identity/application/session.service";
import { DELETE } from "@/app/api/v1/tenants/[tenantId]/route";

const { mockWithTenantTransaction, mockAdministrativeTenantContext } = vi.hoisted(() => ({
  mockWithTenantTransaction: vi.fn(),
  mockAdministrativeTenantContext: vi.fn(),
}));

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: mockWithTenantTransaction,
}));

vi.mock("@/features/identity/web/tenant-authority", () => ({
  administrativeTenantContext: mockAdministrativeTenantContext,
}));

describe("TenantDeletionService", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies deletion if the user is an employee", async () => {
    const service = new TenantDeletionService();
    const context = createVerifiedTenantContext({
      tenantId,
      correlationId: "corr-1",
      source: "administrative",
      actor: { kind: "user", userId: "usr-emp", role: "employee", membershipId: "mem-emp" },
    });

    await expect(service.deleteTenant(context)).rejects.toBeInstanceOf(TenantAccessDeniedError);
    expect(mockWithTenantTransaction).not.toHaveBeenCalled();
  });

  it("denies deletion if the user is an admin but not owner", async () => {
    const service = new TenantDeletionService();
    const context = createVerifiedTenantContext({
      tenantId,
      correlationId: "corr-2",
      source: "administrative",
      actor: { kind: "user", userId: "usr-adm", role: "admin", membershipId: "mem-adm" },
    });

    await expect(service.deleteTenant(context)).rejects.toBeInstanceOf(TenantAccessDeniedError);
    expect(mockWithTenantTransaction).not.toHaveBeenCalled();
  });

  it("allows deletion and executes transactional cleanup when user is owner", async () => {
    const service = new TenantDeletionService();
    const context = createVerifiedTenantContext({
      tenantId,
      correlationId: "corr-3",
      source: "administrative",
      actor: { kind: "user", userId: "usr-owner", role: "owner", membershipId: "mem-owner" },
    });

    const mockDelete = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    const mockTx = {
      delete: mockDelete,
      execute: vi.fn().mockResolvedValue({}),
    };

    mockWithTenantTransaction.mockImplementation(async (_ctx, callback) => {
      return callback(mockTx);
    });

    await service.deleteTenant(context);

    expect(mockWithTenantTransaction).toHaveBeenCalledWith(context, expect.any(Function));
    // Verify that multiple delete operations were called across the dependency tables
    expect(mockDelete.mock.calls.length).toBeGreaterThanOrEqual(15);
  });

  it("opts in to the audit purge before deleting anything", async () => {
    const service = new TenantDeletionService();
    const context = createVerifiedTenantContext({
      tenantId,
      correlationId: "corr-audit",
      source: "administrative",
      actor: { kind: "user", userId: "usr-owner", role: "owner", membershipId: "mem-owner" },
    });

    const order: string[] = [];
    const mockTx = {
      execute: vi.fn(async () => {
        order.push("execute");
        return {};
      }),
      delete: vi.fn(() => {
        order.push("delete");
        return { where: vi.fn().mockResolvedValue({}) };
      }),
    };
    mockWithTenantTransaction.mockImplementation(async (_ctx, callback) => callback(mockTx));

    await service.deleteTenant(context);

    expect(mockTx.execute).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("execute");
  });

  it("erases every tenant-scoped table defined in the schema", async () => {
    const service = new TenantDeletionService();
    const context = createVerifiedTenantContext({
      tenantId,
      correlationId: "corr-coverage",
      source: "administrative",
      actor: { kind: "user", userId: "usr-owner", role: "owner", membershipId: "mem-owner" },
    });

    const deletedTables = new Set<string>();
    const mockTx = {
      execute: vi.fn().mockResolvedValue({}),
      delete: vi.fn((table: unknown) => {
        deletedTables.add(getTableName(table as PgTable));
        return { where: vi.fn().mockResolvedValue({}) };
      }),
    };
    mockWithTenantTransaction.mockImplementation(async (_ctx, callback) => callback(mockTx));

    await service.deleteTenant(context);

    const tenantScopedTables: string[] = [];
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable) || isPgView(value)) continue;
      if (!("tenantId" in value)) continue;
      tenantScopedTables.push(getTableName(value));
    }

    expect(tenantScopedTables.length).toBeGreaterThan(0);
    expect([...tenantScopedTables].filter((name) => !deletedTables.has(name))).toEqual([]);
    expect(deletedTables.has("tenants")).toBe(true);
  });

  it("deletes print job attempts before the jobs and agents they reference", async () => {
    const service = new TenantDeletionService();
    const context = createVerifiedTenantContext({
      tenantId,
      correlationId: "corr-order",
      source: "administrative",
      actor: { kind: "user", userId: "usr-owner", role: "owner", membershipId: "mem-owner" },
    });

    const sequence: string[] = [];
    const mockTx = {
      execute: vi.fn().mockResolvedValue({}),
      delete: vi.fn((table: unknown) => {
        sequence.push(getTableName(table as PgTable));
        return { where: vi.fn().mockResolvedValue({}) };
      }),
    };
    mockWithTenantTransaction.mockImplementation(async (_ctx, callback) => callback(mockTx));

    await service.deleteTenant(context);

    const attempts = sequence.indexOf("print_job_attempts");
    expect(attempts).toBeGreaterThanOrEqual(0);
    expect(attempts).toBeLessThan(sequence.indexOf("print_jobs"));
    expect(attempts).toBeLessThan(sequence.indexOf("print_agents"));
  });
});

describe("DELETE /api/v1/tenants/[tenantId]", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const route = { params: Promise.resolve({ tenantId }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 on successful deletion by owner", async () => {
    const context = createVerifiedTenantContext({
      tenantId,
      correlationId: "corr-ok",
      source: "administrative",
      actor: { kind: "user", userId: "usr-owner", role: "owner", membershipId: "mem-owner" },
    });
    mockAdministrativeTenantContext.mockResolvedValue(context);

    const mockTx = {
      execute: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
    };
    mockWithTenantTransaction.mockImplementation(async (_ctx, callback) => callback(mockTx));

    const request = new Request(`https://komanda.app/api/v1/tenants/${tenantId}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, route);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, message: "Negocio eliminado exitosamente." });
  });

  it("returns 404 (non-disclosing) if the user is not owner", async () => {
    const context = createVerifiedTenantContext({
      tenantId,
      correlationId: "corr-forbidden",
      source: "administrative",
      actor: { kind: "user", userId: "usr-emp", role: "employee", membershipId: "mem-emp" },
    });
    mockAdministrativeTenantContext.mockResolvedValue(context);

    const request = new Request(`https://komanda.app/api/v1/tenants/${tenantId}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, route);
    expect(response.status).toBe(404);
  });
});

