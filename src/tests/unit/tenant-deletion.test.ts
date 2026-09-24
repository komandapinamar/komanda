import { describe, expect, it, vi, beforeEach } from "vitest";
import { TenantDeletionService } from "@/features/tenancy/application/tenant-deletion.service";
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
    };

    mockWithTenantTransaction.mockImplementation(async (_ctx, callback) => {
      return callback(mockTx);
    });

    await service.deleteTenant(context);

    expect(mockWithTenantTransaction).toHaveBeenCalledWith(context, expect.any(Function));
    // Verify that multiple delete operations were called across the dependency tables
    expect(mockDelete.mock.calls.length).toBeGreaterThanOrEqual(15);
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

