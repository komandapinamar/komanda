# Data Model: Add Shadow Members

No structural changes are made to the database schema. The feature leverages the existing `users` and `tenant_memberships` tables.

## Entity: User (Shadow)

A shadow user is inserted into the existing `users` table with specific fields to indicate its pending state.

### Fields used for Shadow User:
- **`id`**: UUID (Generated via `crypto.randomUUID()`)
- **`email`**: String (Original invited email address)
- **`normalizedEmail`**: String (Lowercased and trimmed email for unique constraint)
- **`passwordHash`**: String (Hardcoded to `"!INVITED_USER!"` to prevent login)
- **`status`**: String (Set to `"pending_verification"`)

## Entity: TenantMembership

Links the new shadow user to the tenant.

### Fields used:
- **`id`**: UUID (Generated via `crypto.randomUUID()` or default)
- **`tenantId`**: UUID (Context tenant ID)
- **`userId`**: UUID (The newly generated `id` of the shadow user)
- **`role`**: String (`"admin"` | `"employee"`)
- **`status`**: String (`"active"`)
