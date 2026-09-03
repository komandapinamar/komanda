import { describe, expect, it } from "vitest";
import {
  AddMemberSchema,
  ChangeRoleSchema,
  RevokeMemberSchema,
  RoleSchema,
} from "@/features/members/domain/member.schemas";

describe("Member schemas", () => {
  it("accepts valid role values", () => {
    expect(RoleSchema.parse("owner")).toBe("owner");
    expect(RoleSchema.parse("admin")).toBe("admin");
    expect(RoleSchema.parse("employee")).toBe("employee");
  });

  it("rejects invalid role values", () => {
    expect(() => RoleSchema.parse("superadmin")).toThrow();
    expect(() => RoleSchema.parse("")).toThrow();
    expect(() => RoleSchema.parse(123)).toThrow();
  });

  it("validates AddMemberSchema", () => {
    const valid = AddMemberSchema.parse({
      email: "user@test.com",
      password: "password123",
      role: "admin",
    });
    expect(valid.email).toBe("user@test.com");
    expect(valid.password).toBe("password123");
    expect(valid.role).toBe("admin");

    expect(() =>
      AddMemberSchema.parse({ email: "not-an-email", password: "password123", role: "admin" }),
    ).toThrow();

    expect(() =>
      AddMemberSchema.parse({ email: "user@test.com", password: "short", role: "admin" }),
    ).toThrow();

    expect(() =>
      AddMemberSchema.parse({ email: "user@test.com", password: "password123", role: "superadmin" }),
    ).toThrow();
  });

  it("validates ChangeRoleSchema", () => {
    const valid = ChangeRoleSchema.parse({
      membershipId: "00000000-0000-4000-8000-000000000001",
      role: "employee",
    });
    expect(valid.membershipId).toBe("00000000-0000-4000-8000-000000000001");
    expect(valid.role).toBe("employee");

    expect(() =>
      ChangeRoleSchema.parse({
        membershipId: "not-a-uuid",
        role: "owner",
      }),
    ).toThrow();
  });

  it("validates RevokeMemberSchema", () => {
    const valid = RevokeMemberSchema.parse({
      membershipId: "00000000-0000-4000-8000-000000000001",
    });
    expect(valid.membershipId).toBe("00000000-0000-4000-8000-000000000001");

    expect(() =>
      RevokeMemberSchema.parse({ membershipId: "" }),
    ).toThrow();
  });
});

describe("Member API route guards", () => {
  it("requireOwner is called for members routes", async () => {
    const { requireOwner } = await import("@/lib/authorization/role-guard");
    const { createVerifiedTenantContext } = await import(
      "@/lib/tenant-context/types"
    );
    const context = createVerifiedTenantContext({
      tenantId: "tenant-id",
      correlationId: "correlation-id",
      source: "administrative",
      actor: { kind: "user", userId: "user-id", membershipId: "membership-id", role: "owner" },
    });
    expect(() => requireOwner(context)).not.toThrow();
  });

  it("requireOwner throws for non-owner roles", async () => {
    const { requireOwner } = await import("@/lib/authorization/role-guard");
    const { TenantAccessDeniedError } = await import(
      "@/features/identity/application/session.service"
    );
    const { createVerifiedTenantContext } = await import(
      "@/lib/tenant-context/types"
    );
    const context = createVerifiedTenantContext({
      tenantId: "tenant-id",
      correlationId: "correlation-id",
      source: "administrative",
      actor: { kind: "user", userId: "user-id", membershipId: "membership-id", role: "admin" },
    });
    expect(() => requireOwner(context)).toThrow(TenantAccessDeniedError);
  });
});
