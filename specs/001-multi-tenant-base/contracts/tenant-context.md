# Tenant Context Contract

## Purpose

Every Core operation must produce one verified `TenantContext` before reading or writing tenant-owned data. A caller-supplied tenant identifier is a lookup hint, never authorization.

## Context shape

```text
TenantContext
  tenantId: UUID
  tenantStatus: onboarding | active | suspended
  actor:
    kind: public | user | service | webhook | print_agent | maintenance
    id: UUID/string
  membershipId?: UUID
  locationId?: UUID
  correlationId: UUID
  source: host | api_path | session_selection | webhook_route | agent_token | persisted_job
```

`TenantContext` is created by trusted adapters and passed to application/domain services. UI components, route parameters and request JSON cannot construct it directly.

## Resolution rules

### Provisioning from komanda-business

1. Authenticate the `komanda-business` service identity; browser input alone is never trusted as service authority.
2. Require an idempotency key, contract version and correlation id.
3. Validate `plan_id` against the active definition deployed by a Core migration and resolve the entitlement version.
4. In one transaction create/reuse the pending user, tenant, primary location, owner membership and entitlement snapshot.
5. Core emits a single-use identity verification challenge and returns a short-lived verification/onboarding handoff; `komanda-business` presents the UX but stores no authoritative identity or operational copy.
6. Core alone consumes the challenge and marks the identity verified; provisioning does not activate sales.

If Core is unavailable or rejects the plan, no tenant is considered registered and the external client receives a retriable or actionable problem response.

During local development only, a deterministic fixture may invoke the same validated request schema and provisioning application service for one mock tenant. It must assert a non-production environment before any write, use a stable idempotency key, create no alternative HTTP endpoint and never supply an implicit tenant context. Two-tenant security tests use separate A/B fixtures.

### Entitlement enforcement

After resolving an authenticated or public tenant context, application services load the current immutable snapshot and require the matching flag before catalog administration, online-payment creation or printing. Missing, unknown or disabled flags fail closed before mutation; client claims never add authority.

### Public storefront

1. Proxy normalizes the host or versioned storefront path.
2. The storefront adapter resolves `normalized_slug` through Core.
3. An absent, ambiguous or non-public tenant returns the same not-found response.
4. Core opens a read-only tenant transaction.
5. New carts/checkouts additionally require `tenant.status = active`.

### Authenticated administration

1. Validate the opaque session from the secure web cookie or versioned bearer adapter and require an active user.
2. Read `tenantId` from the versioned path or explicit selection.
3. Find an active `tenant_membership(user_id, tenant_id)`.
4. Enforce role and tenant state for the requested capability.
5. Open tenant transaction with both `app.user_id` and `app.tenant_id`.

Changing tenant means repeating steps 2–5. No tenant id is persisted as unconditional authority inside the session.

### Mercado Pago callback

1. Validate `x-signature` before accepting provider data.
2. Resolve `routingKey` to an integration account.
3. Resolve the provider resource through `provider_resource_routes`.
4. Require routing tenant, integration tenant, payment attempt tenant and cart tenant to match.
5. Persist a unique `webhook_event`.
6. Enter tenant transaction and process idempotently.

Any mismatch is recorded as denied/failed and modifies no payment, order or print job.

### Print agent

1. Split bearer token into public prefix and secret.
2. Find active agent by prefix and verify token digest in constant time.
3. Derive tenant and location exclusively from the agent record.
4. Claim/report only jobs matching both values.

The worker never sends a trusted `tenantId`.

### Background job

The job record carries `tenant_id`. A dispatcher may scan minimal routing/outbox tables using its dedicated role, but processing each item enters a tenant transaction derived from the persisted record.

### Maintenance and migration

Maintenance uses a separate role and an explicit run manifest. It is unavailable to HTTP requests and agent processes. Every mutation records migration run, target tenant, counts and correlation id.

## Database transaction contract

```text
withTenantTransaction(context, callback):
  BEGIN
  set_config('app.tenant_id', context.tenantId, true)
  set_config('app.user_id', context.actor.userId or '', true)
  set_config('app.correlation_id', context.correlationId, true)
  execute callback with transaction-scoped repositories
  COMMIT or ROLLBACK
```

- Configuration is local to the transaction.
- Repositories do not accept a global database client for tenant-owned queries.
- Queries still include explicit `tenant_id` predicates for index usage and readability.
- The runtime role does not own tables and has no `BYPASSRLS`.
- Missing configuration evaluates to no authorized rows.

## Failure semantics

| Condition | External result | Internal action |
|---|---|---|
| tenant slug absent/inactive | 404 | no tenant transaction |
| user lacks membership | 404 | audit denied without target data |
| tenant suspended, read allowed | 200 for permitted history | read-only context |
| tenant suspended, new sale/write | 409 | no commercial mutation |
| resource id belongs to another tenant | 404 | audit denied |
| webhook signature invalid | 401 | no provider lookup with tenant data |
| webhook tenant mismatch | 202/ignored or 409 internally | persist safe diagnostic, no mutation |
| print token invalid/revoked | 401 | no job disclosed |
| background job lacks tenant | failed/dead-letter | no fallback tenant |

## Required test matrix

For every tenant-aware capability:

1. A can read/write A.
2. B can read/write B.
3. A cannot read B by known UUID.
4. A cannot mutate B by known UUID.
5. A-owned child cannot reference B-owned parent.
6. Missing context returns no rows and writes nothing.
7. RLS test runs with the real runtime role.
8. Maintenance role is not available from application configuration.
9. Logs and errors contain no B data when request originates in A.

## Compatibility rule

Legacy unversioned routes may remain during a fixed transition window only when they resolve the configured initial tenant explicitly in a compatibility adapter. They must emit deprecation telemetry and cannot be used by newly registered tenants. The compatibility configuration is removed at contract retirement; it is never a general fallback.
