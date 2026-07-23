# Data Model: Segregación de accesos por rol

## Entities

### tenant_memberships (existing — expanded)

| Column | Type | Changes | Description |
|--------|------|---------|-------------|
| id | uuid PK | — | Identificador único |
| tenant_id | uuid FK → tenants.id | — | Tenant al que pertenece |
| user_id | uuid FK → users.id | — | Usuario global |
| role | text | **Expandir** de `"owner"` a `"owner" \| "admin" \| "employee"` | Rol del miembro en el tenant |
| status | text | — | `"active"` \| `"revoked"` |
| created_at | timestamp | — | Fecha de creación |
| updated_at | timestamp | — | Fecha de última modificación |

**Constraints:**
- PK: `id`
- Unique: `(tenant_id, user_id)` — un usuario por tenant
- Unique: `(tenant_id, id)` — tenant-qualified references
- FK: `tenant_id → tenants.id` (RESTRICT)
- FK: `user_id → users.id` (RESTRICT)
- Check: `role IN ('owner', 'admin', 'employee')`
- Index: `(user_id, status)` — lookup de membresías activas por usuario
- Index: `(tenant_id, status)` — listar miembros activos de un tenant

### audit_events (existing — new event types)

Event types nuevos para membresías:

| event_type | payload |
|------------|---------|
| `membership_created` | `{ user_email, role, created_by_user_id }` |
| `membership_role_changed` | `{ user_email, previous_role, new_role, changed_by_user_id }` |
| `membership_revoked` | `{ user_email, previous_role, revoked_by_user_id }` |

### Key relationships

```text
tenants 1 ── * tenant_memberships * ── 1 users
   │                                        │
   │             (role: owner/admin/employee)│
   │                                        │
   └── settings                             │
   └── locations                            │
   └── catalog                              │
                                            │
                                   users 1 ── * user_sessions
```

### State machine: membership status

```text
     ┌──────────┐
     │  active  │
     └────┬─────┘
          │ revoke
          ▼
     ┌──────────┐
     │ revoked  │  (terminal)
     └──────────┘

Role transitions (by owner only):
  owner    → admin (allowed, but warn if last owner)
  owner    → employee (allowed, but warn if last owner)
  admin    → employee (allowed)
  admin    → owner (allowed)
  employee → admin (allowed)
  employee → owner (allowed)
```

## Validation rules

- `role` must be one of: `owner`, `admin`, `employee`
- At least one `owner` membership must remain active per tenant
- Owner cannot revoke or change their own role if they are the last active owner
- `status` transitions: `active` → `revoked` only (no reactivation in v1)
- `user_id` must reference an existing user in the `users` table

---

## Domain types

### Member operation schemas

| Schema | Fields | Purpose |
|--------|--------|---------|
| `AddMemberInput` | `email: string`, `role: "admin" | "employee"` | Input para agregar nuevo miembro |
| `ChangeRoleInput` | `membershipId: string`, `role: "owner" | "admin" | "employee"` | Input para cambiar rol |
| `RevokeMemberInput` | `membershipId: string` | Input para revocar membresía |
| `MemberOutput` | `id`, `email`, `role`, `status`, `createdAt` | Output para listar miembros |

### Role type union

```typescript
type Role = "owner" | "admin" | "employee";
```

This type is used across:
- DB schema: `tenant_memberships.role`
- Domain types: `TenantActor.role`, `LiveMembership.role`
- API validation: Zod schemas in `member.schemas.ts`
