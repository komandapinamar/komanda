# Tasks: Segregación de accesos por rol

**Input**: Design documents from `/specs/002-rbac-access-segregation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: Tests are included for role isolation, API guards, and member management as required by the spec.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as an independent increment.

**Repository Scope**: All tasks belong to Core (Next.js).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes a different file and has no dependency on another incomplete task in the same phase.
- **[Story]**: Maps the task to a user story in [spec.md](spec.md).
- Every task names the exact file or directory it must create or modify.

---

## Phase 1: Expand role types in schema, types, and resolvers

**Purpose**: Expand the current single-role system (`"owner"` literal) to support `"owner" | "admin" | "employee"` across all type definitions, DB schema, and resolvers so that downstream authorization can distinguish between roles.

**⚠️ CRITICAL**: No other user story can begin until this phase completes.

### T001 [US1] Expand `tenant_memberships.role` type [X]

---

### T002 [US1] Create migration for role constraint [X]

---

### T003 [P] [US1] Expand `TenantActor` role type [X]

---

### T004 [P] [US1] Expand `LiveMembership` role type [X]

---

### T005 [P] [US1] Expand Zod literal in provisioning schemas [X] — No changes needed (provisioning uses `z.literal("owner")` which is correct)

---

### T006 [P] [US1] Update provisioning service and repository [X] — No changes needed (provisioning hardcodes `"owner"` which is correct)

---

### T007 [US1] Verify resolvers and web adapters pass role correctly [X]

---

### T008 [US1] Add integration test for three roles [X]

---

**Checkpoint**: The system stores and resolves three roles (owner, admin, employee) without breaking existing owner provisioning. All Phase 1 tests pass.

---

## Phase 2: Authorization guards for API routes and server-side operations [X]

**Checkpoint**: Every protected API route checks the role and fails closed. Tests verify owner/admin/employee access for each route category.

---

## Phase 3: Conditional navigation and page rendering [X]

### T021 [US3] Create permission helper

**File**: `src/lib/authorization/permissions.ts` (NEW)

**Changes**:
Create new file with:
```typescript
import type { Role } from "@/db/schema/platform";

export type Section = 
  | "estado" 
  | "pedidos" 
  | "catalog" 
  | "configuracion" 
  | "integraciones" 
  | "members";

const SECTION_PERMISSIONS: Record<Section, Role[]> = {
  estado: ["owner", "admin", "employee"],
  pedidos: ["owner", "admin", "employee"],
  catalog: ["owner", "admin"], // employee sees read-only
  configuracion: ["owner"],
  integraciones: ["owner"],
  members: ["owner"],
};

export function canAccess(role: Role, section: Section): boolean {
  return SECTION_PERMISSIONS[section].includes(role);
}

export function canWriteCatalog(role: Role): boolean {
  return role === "owner" || role === "admin";
}
```

**Acceptance**: File exports `canAccess` and `canWriteCatalog`. TypeScript compiles.

---

### T022 [US3] Implement conditional navigation in layout

**File**: `src/app/(admin)/admin/[tenantId]/layout.tsx`

**Changes**:
1. Import `canAccess` from `@/lib/authorization/permissions`
2. Extract role from `authority.membership.role`
3. Conditionally render each nav link based on `canAccess(role, section)`
4. Add "Miembros" link for owners

**Current nav links**:
- Estado → all roles
- Pedidos → all roles  
- Catálogo → owner, admin (employee can access page but read-only)
- Configuración → owner only
- Integraciones → owner only
- Miembros → owner only (NEW)

**Acceptance**: Nav shows correct links per role.

---

### T023 [US3] Protect catalog page with role check

**File**: `src/app/(admin)/admin/[tenantId]/catalog/page.tsx`

**Changes**:
1. Get role from `authority.membership.role`
2. Pass `isReadOnly={role === "employee"}` prop to `CatalogEditor`
3. OR: If employee, still render page but in read-only mode

**Acceptance**: Employee sees catalog without edit buttons. Owner/admin see full editor.

---

### T024 [US3] Protect settings page

**File**: `src/app/(admin)/admin/[tenantId]/settings/page.tsx`

**Changes**:
1. Import `requireOwner` from `@/lib/authorization/role-guard`
2. After resolving authority, check:
   ```typescript
   if (authority.membership.role !== "owner") {
     notFound();
   }
   ```

**Acceptance**: Admin and employee see 404 when accessing /settings.

---

### T025 [US3] Protect integrations page

**File**: `src/app/(admin)/admin/[tenantId]/integrations/page.tsx`

**Changes**: Same as T024 - require owner role.

**Acceptance**: Admin and employee see 404 when accessing /integrations.

---

### T026 [US3] Protect onboarding page

**File**: `src/app/(admin)/admin/[tenantId]/onboarding/page.tsx`

**Changes**: Same as T024 - require owner role.

**Acceptance**: Admin and employee see 404 when accessing /onboarding.

---

### T027 [US3] Implement read-only mode in CatalogEditor

**File**: `src/features/catalog/web/CatalogEditor.tsx`

**Changes**:
1. Add prop: `isReadOnly?: boolean`
2. When `isReadOnly` is true:
   - Hide "Nuevo" / "Create" buttons
   - Hide "Editar" / "Edit" buttons  
   - Hide "Eliminar" / "Delete" buttons
   - Show data in read-only table format

**Acceptance**: Employee sees catalog data without action buttons.

---

### T028 [US3] Add E2E tests for role-based navigation

**File**: `src/tests/e2e/rbac-navigation.spec.ts` (NEW)

**Changes**:
Create Playwright test that:
1. Logs in as owner → verifies all nav links visible
2. Logs in as admin → verifies Estado, Pedidos, Catálogo visible; Config, Integraciones, Miembros hidden
3. Logs in as employee → verifies Estado, Pedidos visible; Catálogo, Config, Integraciones, Miembros hidden
4. Employee visits /catalog → sees read-only view
5. Employee visits /settings directly → sees 404

**Acceptance**: E2E tests pass for all three roles.

---

**Checkpoint**: Each role sees only its permitted sections. Employee catalog view is read-only. Tests pass for all three roles.

---

## Phase 4: Member management page (Owner only) [X]

### T029 [US4] Create member domain schemas

**File**: `src/features/members/domain/member.schemas.ts` (NEW)

**Changes**:
Create Zod schemas:
```typescript
import { z } from "zod";

export const RoleSchema = z.enum(["owner", "admin", "employee"]);

export const AddMemberSchema = z.object({
  email: z.string().email(),
  role: RoleSchema,
});

export const ChangeRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: RoleSchema,
});

export const RevokeMemberSchema = z.object({
  membershipId: z.string().uuid(),
});

export type AddMemberInput = z.infer<typeof AddMemberSchema>;
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;
export type RevokeMemberInput = z.infer<typeof RevokeMemberSchema>;
```

**Acceptance**: File exports schemas and types. TypeScript compiles.

---

### T030 [P] [US4] Create MemberService

**File**: `src/features/members/application/member.service.ts` (NEW)

**Changes**:
Create service with methods:
- `listMembers(context: TenantContext): Promise<MemberOutput[]>`
- `addMember(context: TenantContext, input: AddMemberInput): Promise<MemberOutput>`
- `changeRole(context: TenantContext, input: ChangeRoleInput): Promise<void>`
- `revokeMember(context: TenantContext, input: RevokeMemberInput): Promise<void>`

Each method should:
1. Use `withTenantTransaction`
2. Validate business rules (e.g., last owner protection)
3. Call repository methods

**Acceptance**: Service class exists with all methods. TypeScript compiles.

---

### T031 [P] [US4] Create MemberRepository

**File**: `src/features/members/infrastructure/member.repository.ts` (NEW)

**Changes**:
Create repository with methods:
- `listByTenant(tx, tenantId): Promise<MembershipWithUser[]>`
- `findByUserEmail(tx, tenantId, email): Promise<Membership | null>`
- `create(tx, membership): Promise<Membership>`
- `updateRole(tx, membershipId, role): Promise<void>`
- `revoke(tx, membershipId): Promise<void>`
- `countActiveOwners(tx, tenantId): Promise<number>`

**Acceptance**: Repository class exists. TypeScript compiles.

---

### T032 [US4] Create member API routes

**File**: `src/app/api/v1/tenants/[tenantId]/members/route.ts` (NEW)

**Changes**:
Create API routes:
- `GET` → list members
- `POST` → add member
- `PATCH` → change role
- `DELETE` → revoke member

Each route should:
1. Resolve TenantContext
2. Call `requireOwner(context)`
3. Parse and validate input
4. Call MemberService
5. Return appropriate response

**Acceptance**: API routes exist. TypeScript compiles.

---

### T033 [US4] Protect member API routes

**File**: `src/app/api/v1/tenants/[tenantId]/members/route.ts`

**Changes**:
Already included in T032 - add `requireOwner(context)` to all handlers.

**Acceptance**: Only owner can access /members routes.

---

### T034 [US4] Add error handling for non-existent user

**File**: `src/features/members/application/member.service.ts`

**Changes**:
In `addMember` method:
1. Look up user by email
2. If user not found, throw `UserNotFoundError` with message "User not found"
3. Create custom error class if needed

**Acceptance**: Adding member with non-existent email returns clear error.

---

### T035 [US4] Create MemberManager component

**File**: `src/features/members/web/MemberManager.tsx` (NEW)

**Changes**:
Create React component with:
1. Table showing: email, role, status, actions
2. "Add member" form with email input and role dropdown
3. "Change role" dropdown per row
4. "Revoke" button per row
5. Error handling for non-existent user

**Acceptance**: Component renders correctly. Can add/change/revoke members.

---

### T036 [US4] Create member management page

**File**: `src/app/(admin)/admin/[tenantId]/members/page.tsx` (NEW)

**Changes**:
Create page that:
1. Authorizes owner role
2. Fetches initial members list
3. Renders `MemberManager` component

**Acceptance**: Page exists at /admin/[tenantId]/members. Only owner can access.

---

### T037 [US4] Add member link to navigation

**File**: `src/app/(admin)/admin/[tenantId]/layout.tsx`

**Changes**:
Add "Miembros" link to navigation, visible only for owner role (already done in T022).

**Acceptance**: Owner sees "Miembros" link in nav.

---

### T038 [US4] Implement "last owner" guard

**File**: `src/features/members/application/member.service.ts`

**Changes**:
In `changeRole` and `revokeMember` methods:
1. Check if target membership is the user's own
2. Check if user is the last active owner
3. If both true, throw `LastOwnerError`
4. Query: `SELECT COUNT(*) FROM tenant_memberships WHERE tenant_id = ? AND role = 'owner' AND status = 'active'`

**Acceptance**: Last owner cannot change their role or revoke themselves.

---

### T039 [US4] Add integration tests for members

**File**: `src/tests/integration/members.integration.test.ts` (NEW)

**Changes**:
Test scenarios:
1. Owner can list members
2. Owner can add admin member
3. Owner can add employee member
4. Owner can change role admin → employee
5. Owner can revoke member
6. Last owner cannot change own role
7. Last owner cannot revoke self
8. Adding member with non-existent email returns error
9. Admin cannot access /members routes

**Acceptance**: All integration tests pass.

---

### T040 [US4] Add E2E test for member lifecycle

**File**: `src/tests/e2e/rbac-members.spec.ts` (NEW)

**Changes**:
E2E test that:
1. Owner logs in
2. Navigates to /members
3. Adds new admin member
4. Changes role to employee
5. Verifies employee can access orders but not settings
6. Revokes membership
7. Verifies revoked member cannot access tenant

**Acceptance**: E2E test passes.

---

**Checkpoint**: Owner manages members from a dedicated page. Last-owner guard works. Error for non-existent user is clear. Tests pass.

---

## Phase 5: Audit events for membership changes [X]

### T041 [US5] Add audit event constants

**File**: `src/features/members/application/member.service.ts`

**Changes**:
Define event type constants:
```typescript
export const MEMBERSHIP_AUDIT_EVENTS = {
  CREATED: "membership_created",
  ROLE_CHANGED: "membership_role_changed",
  REVOKED: "membership_revoked",
} as const;
```

**Acceptance**: Constants defined.

---

### T042 [US5] Wire audit logging into member service

**File**: `src/features/members/application/member.service.ts`

**Changes**:
In each operation, after successful mutation:
1. Call `auditService.logEvent()` with:
   - `tenantId`
   - `eventType` (from T041 constants)
   - `actor` (from context)
   - `payload` (email, role, previous role if applicable)

**Acceptance**: Each membership operation creates audit event.

---

### T043 [US5] Add audit verification tests

**File**: `src/tests/integration/members-audit.integration.test.ts` (NEW)

**Changes**:
Test that after each operation:
1. Add member → audit event exists with `membership_created`
2. Change role → audit event exists with `membership_role_changed` and both roles
3. Revoke member → audit event exists with `membership_revoked`

**Acceptance**: Audit tests pass.

---

**Checkpoint**: Membership audit trail is complete and verified by tests.

---

## Phase 6: Edge cases and additional tests [X]

### T044 Test: Role change doesn't affect active session

**File**: `src/tests/integration/session-role-change.integration.test.ts` (NEW)

**Changes**:
Test that:
1. User has active session with role "admin"
2. Owner changes user's role to "employee"
3. User's next request still shows "admin" (session already resolved)
4. User's subsequent requests show "employee"

**Acceptance**: Test verifies role change applies on next session resolution.

---

### T045 Test: Revoked member denied immediately

**File**: `src/tests/tenant-isolation/revoked-membership.integration.test.ts` (NEW)

**Changes**:
Test that:
1. Member has active session
2. Owner revokes membership
3. Member's next request receives 404 on any tenant route

**Acceptance**: Test verifies revoked member cannot access tenant.

---

### T046 Validate role input on member API

**File**: `src/app/api/v1/tenants/[tenantId]/members/route.ts`

**Changes**:
Ensure input validation rejects invalid roles:
- Use Zod schema from T029
- Return 400 with clear error message for invalid role

**Acceptance**: Invalid role values return 400 error.

---

**Checkpoint**: All edge cases from spec are covered by tests.

---

## Summary

| Phase | Tasks | Purpose |
|-------|-------|---------|
| 1 | T001-T008 (8) | Expand role types in DB, types, schemas |
| 2 | T009-T020 (12) | Add authorization guards to API routes |
| 3 | T021-T028 (8) | Conditional navigation and page rendering |
| 4 | T029-T040 (12) | Member management page |
| 5 | T041-T043 (3) | Audit events |
| 6 | T044-T046 (3) | Edge cases and tests |

**Total: 46 tasks**

### MVP Scope

Phases 1-3 deliver core RBAC: roles work, APIs protected, UI adapts per role.

### Parallel Opportunities

- Phase 1: T003, T004, T005, T006 can run in parallel
- Phase 2: T010, T011, T012, T013 can run in parallel after T009
- Phase 3: T022-T027 can run in parallel after T021
- Phase 4: T030, T031 can run in parallel after T029
