# Implementation Plan: Plataforma multi-tenant autoservicio

**Branch**: `feature/001-multitenant-structure` | **Date**: 2026-07-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-multi-tenant-base/spec.md`

**Owning Repository**: Core (Next.js)

**External Consumer Impact**: `komanda-business` owns the Astro acquisition, commercial-plan selection, registration and identity-verification UX. It sends `plan_id` plus owner/business data through Core's versioned provisioning contract and presents challenges generated and validated by Core; the Python print agent moves to the versioned tenant-scoped claim/result contract. Both consumers use compatibility windows and do not require a simultaneous release.

Until `komanda-business` is functional, local development and automated contract tests provision one deterministic mock tenant through the same validated request schema and provisioning application service. This fixture is guarded against production execution, creates no alternate endpoint/table and is never used as a tenant fallback; isolation suites still provision tenants A/B independently.

## Summary

Migrate the current single-business application to a shared-schema multi-tenant Core. Every operational row receives explicit tenant ownership, cross-tenant relationships are blocked by composite constraints, and runtime access is protected by both server authorization and PostgreSQL RLS. The existing business becomes the initial tenant through an idempotent expand/backfill/reconcile/cutover process.

Strapi catalog data moves to Core; images move to object storage. Global admin and print credentials become user memberships and tenant/location print agents, while every tenant—including the initial business—connects Mercado Pago exclusively through OAuth before payment cutover. Core owns identity verification, deploys accepted plan definitions through versioned migrations, persists an entitlement snapshot and enforces the initial `catalog_management`, `online_payments` and `printing` flags at application-service boundaries. Versioned Core contracts replace direct framework coupling, while compatibility adapters preserve the initial tenant until the seven-day cutover pilot completes.

Technical decisions and rejected alternatives are documented in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 (minimum supported by project: 20.19); Python 3.11+ for the print worker

**Primary Dependencies**: Next.js 16.2.10, React 19.2, Drizzle ORM 0.45.2/Drizzle Kit 0.31, a provider-neutral PostgreSQL TCP driver behind the database adapter, PostgreSQL RLS, OpenTofu 1.12 with pinned `kislerdm/neon` 0.13.0 for development and pinned `hashicorp/azurerm` 4.67.0 for Azure staging/production, `jose`, `bcrypt`, Mercado Pago SDK 3.2, Zod 4 for runtime contracts, object-storage adapters, an identity-verification delivery port with a test capture sink and deployment-selected provider adapter, Python `requests` and `python-escpos`

**Storage**: Neon PostgreSQL only for remote development with synthetic data; independent Azure Database for PostgreSQL Flexible Server instances for staging and production; shared schema within each environment; Azure Blob-compatible object storage for production media; no tenant-local filesystem and no Strapi dependency after cutover

**Testing**: Vitest 4 for unit/integration/producer-contract tests; PostgreSQL 17 ephemeral database in CI; Neon development compatibility checks; mandatory Azure staging migration, runtime-role/RLS, restore, E2E and k6 acceptance gates; Playwright for browser E2E; pytest for print worker; migration rehearsal on anonymized snapshots that never enter Neon

**Target Platform**: Linux containers for Core and background processing deployed in Azure with private access to Azure PostgreSQL in staging/production; Neon development remains externally managed; controlled migration connections are separated from runtime connections; Raspberry Pi/Linux print agents remain inside each business

**Project Type**: Web application with versioned service API, background/outbox processing and an independently deployed local print agent

**Performance Goals**: 95% of storefront/catalog/order views useful in <2 seconds with 100 tenants and 50 concurrent operators; 95% of order events visible in the correct panel within 5 seconds; print and webhook processing idempotent under retries

**Constraints**: fail closed without tenant context; no runtime database owner/BYPASSRLS role; no session-level PostgreSQL state over pooled connections; no global credential or mock-tenant fallback; mock provisioning fixtures hard-fail in production; Neon never receives production data or credentials; Azure staging must pass before production promotion; provider-specific behavior stays behind adapters; additive migrations before destructive cleanup; no indefinite dual write; cutover maintenance target <=15 minutes; secrets never logged or returned after storage

**Scale/Scope**: initial business migration plus self-service growth to at least 100 tenants, one primary location per tenant in this feature, independently editable catalogs and tenant-scoped carts/payments/orders/print jobs

**Cross-Repository Contracts**: Core OpenAPI v1 provisioning contract accepts `plan_id` and registration data from `komanda-business`, returns a verification/onboarding handoff and keeps verification authority in Core; Core print claim/result v1 contract serves `print-service`; no consumer accesses the Core database; legacy unversioned routes remain only for an explicit initial-tenant transition window

**Supported Clients**: current Next.js administration and storefront; Astro-based `komanda-business` acquisition/registration client; Python print agent; adapter-independent service contracts suitable for future Expo/mobile clients

**Degraded Mode**: acquisition outage does not affect existing tenants; Mercado Pago outage blocks new online payments only; print outage retains leased/pending jobs; Strapi outage after cutover has no effect; background jobs without tenant context are failed/dead-lettered without fallback

**Environment Matrix**: local/CI uses ephemeral PostgreSQL 17; remote development uses Neon; staging and production use separate Azure PostgreSQL instances and separate OpenTofu states. Only Azure staging is accepted as production-equivalent evidence.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-research gate

- **Core ownership**: **PASS** — Core becomes the only source of truth for identity, tenants, memberships, entitlement snapshots, catalog, carts, payments, orders and printing; `komanda-business` owns only the acquisition and registration experience.
- **Independent delivery**: **PASS** — external consumers use versioned contracts and compatibility windows; Core deployment, migration and rollback do not require a simultaneous consumer release.
- **Contract and mobile readiness**: **PASS** — all business capabilities sit behind application services and OpenAPI contracts; Server Actions/routes remain adapters.
- **Tenant isolation**: **PASS** — explicit context, composite tenant foreign keys, RLS, fail-closed behavior and a real two-tenant denial matrix are mandatory.
- **Performance and operations**: **PASS** — response/event budgets, outbox, diagnostics, contract tests, load tests and dependency-failure behavior are defined.
- **Migration and rollback**: **PASS** — expand/backfill/validate/cutover/contract sequence is idempotent, reconciled and reversible until Core writes reopen.

### Post-design gate

- **Core ownership**: **PASS** — [data-model.md](data-model.md) assigns every operational entity and entitlement snapshot to Core, while [migration-contract.md](contracts/migration-contract.md) retires Strapi after reconciliation.
- **Independent delivery**: **PASS** — OpenAPI v1 and explicit compatibility windows decouple acquisition and print-agent rollout.
- **Contract and mobile readiness**: **PASS** — [openapi.yaml](contracts/openapi.yaml) exposes versioned interfaces independent of UI components/cookies at the business-service layer; cookie and bearer mechanisms are adapters.
- **Tenant isolation**: **PASS** — [tenant-context.md](contracts/tenant-context.md) defines every resolution path and RLS transaction; data relationships are tenant-composite.
- **Performance and operations**: **PASS** — tenant-first indexes, cursor pagination, incremental order events, leases, outbox and runnable validation targets are specified.
- **Migration and rollback**: **PASS** — migration modes, blocking conditions, stage gates and pre/post-write rollback rules are explicit.

No constitutional exceptions are required.

## Current-State Findings

| Current area | Limitation found | Migration consequence |
|---|---|---|
| `src/db/schema.ts` | carts, payments, orders and print jobs lack `tenant_id`, foreign keys and location ownership | additive columns/tables, batch backfill, composite constraints and RLS are mandatory before tenant registration |
| `admin_users` + JWT | one global username/role, no memberships or revocation store | migrate current hash to global user + owner membership; replace cookie/session contract |
| `menu.service.ts` | runtime reads Strapi directly and domain ids are Strapi `documentId` | import catalog/media, introduce Core repository, keep legacy ids only in migration maps |
| cart persistence | JSON snapshot contains catalog data but no tenant or add-on model | assign initial tenant; normalize new carts/lines/options; preserve snapshot fields |
| Mercado Pago | one process-global access token, webhook secret and base URL | OAuth seller account per tenant; global app secret only for provider verification; tenant correlation persisted |
| payment webhook | route owns extensive business orchestration and uses global stores | move orchestration to tenant-aware application service and outbox transaction |
| order service | global lists and globally unique idempotency keys; two fulfillment states | tenant-first indexes/keys, full detail snapshots, transition service and tenant event cursor |
| live dashboard | every connection reloads all active orders every 2 seconds | incremental tenant-scoped `order_events`/outbox stream |
| printing | one global token; no tenant/location; processing jobs have no lease | scoped agent credentials, tenant/location queue, lease expiry and attempt history |
| branding/config | restaurant strings and image hosts are hardcoded | tenant settings/media assets drive storefront and ticket payload |
| migrations | README promotes `db:push`; no production migrate script | versioned SQL, custom backfills, direct migration URL and CI drift check |
| plans/entitlements | no versioned operational plan catalog or per-tenant snapshot | deploy every accepted definition/version through reviewed Core migrations, validate external `plan_id`, persist immutable entitlements and enforce the three initial flags |
| tests | no application test files or test scripts | safety harness is the first implementation slice, not a final cleanup task |

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-tenant-base/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   ├── tenant-context.md
│   └── migration-contract.md
└── tasks.md                     # generated by /speckit-tasks, not this command
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (admin)/admin/
│   │   ├── select-business/
│   │   └── [tenantId]/
│   │       ├── onboarding/
│   │       ├── catalog/
│   │       ├── integrations/
│   │       └── orders/
│   ├── (shop)/
│   │   ├── order/
│   │   └── checkout/
│   └── api/v1/
│       ├── auth/
│       ├── provisioning/
│       ├── tenants/
│       ├── storefronts/
│       ├── integrations/mercadopago/
│       └── print/
├── db/
│   ├── index.ts
│   ├── roles.ts
│   └── schema/
│       ├── platform.ts
│       ├── catalog.ts
│       ├── commerce.ts
│       ├── integrations.ts
│       ├── printing.ts
│       ├── events.ts
│       └── audit.ts
├── drizzle/
│   ├── <expand-and-role-migrations>.sql
│   ├── <backfill-and-validation-migrations>.sql
│   └── <contract-cleanup-migrations>.sql
├── features/
│   ├── tenancy/{domain,application,infrastructure,web}/
│   ├── identity/{domain,application,infrastructure,web}/
│   ├── entitlements/{domain,application,infrastructure,web}/
│   ├── catalog/{domain,application,infrastructure,web}/
│   ├── cart/{domain,application,infrastructure,web}/
│   ├── payments/{domain,application,infrastructure,web}/
│   ├── orders/{domain,application,infrastructure,web}/
│   └── printing/{domain,application,infrastructure,web}/
├── lib/
│   ├── tenant-context/
│   ├── encryption/
│   ├── object-storage/
│   ├── idempotency/
│   └── observability/
├── scripts/migration/
│   ├── preflight.ts
│   ├── import.ts
│   ├── reconcile.ts
│   └── cutover.ts
└── tests/
    ├── contract/
    ├── integration/
    ├── tenant-isolation/
    ├── migration/
    ├── e2e/
    └── load/

print-service/
├── print_worker.py
├── komanda_print/
│   ├── client.py
│   ├── renderer.py
│   └── printer.py
└── tests/

cms/                              # read-only migration source; removed after Gate E

infra/database/
├── neon/                         # development only
└── azure/
    ├── modules/postgresql/       # shared Azure implementation
    ├── staging/                  # fixed staging state/environment
    └── production/               # fixed production state/environment
```

**Structure Decision**: keep the existing repository and Next.js application root under `src/`, but split business rules from web adapters and split the monolithic Drizzle schema by domain. No new deployable backend is introduced; versioned route handlers adapt reusable application services. The Python agent remains independently deployable and consumes only the documented print contract.

## Target Architecture

### Request flow

```text
host/path/session/webhook/agent token
              │
              ▼
trusted adapter resolves identity + tenant hint
              │
              ▼
TenantContext resolver validates membership/status/correlation
              │
              ▼
withTenantTransaction() sets transaction-local RLS context
              │
              ▼
application service → domain rules → repositories/outbox
              │
              ▼
versioned response/event without secrets or foreign-tenant data
```

### Layer rules

1. Route handlers, Server Actions, pages and the print HTTP adapter do parsing/auth transport only.
2. Application services own use-case orchestration and receive a trusted `TenantContext`.
3. Domain modules own state transitions, pricing/readiness/idempotency rules and contain no Next.js imports.
4. Infrastructure repositories require a tenant-scoped transaction for every tenant-owned query.
5. External providers sit behind interfaces; Mercado Pago, object storage and print transport cannot leak provider DTOs into domain types.
6. Every state mutation and side effect writes audit/outbox evidence in the same transaction.

### Tenant resolution

- Public storefront: normalized host/subdomain or versioned tenant slug.
- Administration: authenticated user + selected tenant id + active membership.
- Payment callback: provider signature + routing key + persisted resource correlation.
- Print: bearer token resolves agent, tenant and location server-side.
- Background: persisted tenant id from job/outbox record.
- Maintenance: explicit manifest and separate role; never a web fallback.

External provisioning is a separate trusted path: `komanda-business` authenticates as a service consumer and supplies an idempotent request with `plan_id`. Core validates the active plan version and atomically creates or links the pending owner identity, tenant, primary location, owner membership and immutable entitlement snapshot before issuing a short-lived verification/onboarding handoff. Core generates and validates single-use verification challenges; the external client only presents that UX.

The detailed contract is [tenant-context.md](contracts/tenant-context.md).

## Migration Strategy

### Release 0 — Baseline and safety harness

**Changes**:

- Add lint/typecheck/test scripts and CI stages.
- Capture anonymized operational snapshot and Strapi export.
- Add contract, RLS-role, migration, two-tenant, payment and print fixtures.
- Add a deterministic one-tenant local bootstrap fixture that invokes the production provisioning schema/service and refuses production execution.
- Instrument current routes with correlation ids and baseline latency/error counters.

**Exit gate**: current single-business flows have reproducible regression tests; backup restore is proven.

**Rollback**: test/instrumentation-only release.

### Release 1 — Expand schema and security roles

**Changes**:

- Add platform, identity verification, plan definition, entitlement snapshot, settings, catalog, integration, event, audit and migration tables.
- Seed accepted plan definitions and their `catalog_management`, `online_payments` and `printing` flags through reviewed, idempotent migrations.
- Create separate migration owner and least-privilege runtime roles.
- Add nullable `tenant_id`, `location_id` and replacement references to populated legacy operational tables.
- Add compatibility code that writes an explicitly configured `INITIAL_TENANT_ID`; it is never used when context is ambiguous.
- Add `withTenantTransaction` and repositories, but keep public behavior on legacy adapters.

**Exit gate**: previous application release runs against expanded schema; new writes contain the explicit initial tenant; runtime role cannot bypass RLS on new tables.

**Rollback**: revert application; additive schema remains.

### Release 2 — Seed and backfill the initial tenant

**Changes**:

- Create initial tenant, primary location, owner identity/membership/settings and entitlement snapshot from the manifest's valid initial plan.
- Reuse the current bcrypt hash; migration manifest supplies verified owner email.
- Backfill carts, payment attempts, orders and print jobs in bounded idempotent batches.
- Reconstruct immutable order lines from cart snapshots.
- Create tenant-first indexes, composite foreign keys as `NOT VALID`, reconcile, then validate.
- Migrate the global print token to an initial agent compatibility record; do not import the global Mercado Pago token into the new model and require the initial tenant to complete OAuth before payment cutover.

**Exit gate**: operational counts/checksums match; no orphan chain; every row has determinable tenant; cross-tenant fixture is rejected at database and service layers.

**Rollback**: application still reads legacy-compatible columns; imported rows and mapping tables remain for repair/retry.

### Release 3 — Tenant-aware identity, routing and Core API v1

**Changes**:

- Replace global admin session with user sessions, Core-owned single-use identity verification and live membership checks.
- Add tenant selection and tenant-scoped admin routes.
- Introduce provisioning, verification, entitlement, catalog, storefront, cart, payment, order and print application services behind OpenAPI v1; Core exposes no acquisition form because that UX belongs to `komanda-business`.
- Enforce `catalog_management`, `online_payments` and `printing` at the corresponding application-service entry points with default denial for absent/unknown flags.
- Keep unversioned adapters for the initial tenant with deprecation telemetry.
- Enable RLS after all service paths use tenant transactions.
- Introduce `order_events`/outbox and incremental SSE cursor; stop full-order polling.

**Exit gate**: producer contracts pass; two tenant users cannot cross-read/write using known UUIDs; legacy initial-tenant regression stays green.

**Rollback**: keep schema and new data; route traffic back to compatibility adapters that still read tenant-aware tables.

### Release 4 — Catalog and media migration

**Changes**:

- Implement Core catalog CRUD, optimistic versions, readiness checks and tenant branding.
- Implement S3-compatible media upload/copy adapter.
- Run Strapi preflight/import while storefront continues reading Strapi.
- Shadow-read Core and compare category/item/combo payloads and media checksums.
- Freeze Strapi edits, run final delta and reconciliation, then switch catalog read flag to Core.

**Exit gate**: 100% published records/media reconciled; cart/checkout snapshots match; storefront runs with Strapi stopped.

**Rollback**:

- before Core catalog writes reopen: switch read flag back to frozen Strapi;
- after writes reopen: do not restore Strapi authority; roll back to a Core-compatible application release or forward-fix.

### Release 5 — Tenant Mercado Pago and print agents

**Changes**:

- Add Mercado Pago OAuth Authorization Code + PKCE flow per seller.
- Require OAuth for every tenant and expose no manual access-token/API-key onboarding or migration path.
- Encrypt access/refresh tokens with key versioning; add refresh/revoke/health states.
- Route and authenticate webhooks before entering tenant processing.
- Add print-agent enrollment, scoped token rotation, leases, retries and attempts.
- Upgrade Python worker to v1 contract and tenant branding; support legacy global token only for the initial agent window.

**Exit gate**: two seller accounts receive only their tenant payments; webhook mismatch modifies nothing; two agents cannot cross-claim; lease recovery and idempotent result tests pass.

**Rollback**: disable new connections/agents; initial tenant continues through its imported credential and compatibility agent until the defined window ends.

### Release 6 — Controlled tenant rollout

**Changes**:

- Complete onboarding dashboard and activation gate.
- Provision at least two internal tenants, then limited pilot tenants.
- Run 100-tenant/50-operator load test and dependency-failure exercises.
- Enable the production `komanda-business` provisioning integration only after isolation, entitlement, recovery and performance gates pass.

**Exit gate**: all `quickstart.md` evidence is attached; no P1 isolation/performance defect remains.

**Rollback**: stop new provisioning and suspend pilot sales without affecting initial tenant history or already approved payments.

### Release 7 — Contract and legacy cleanup

**Changes**:

- Observe seven-day initial-tenant pilot and agreed zero-usage window for legacy routes.
- Remove Strapi runtime calls, remote image hosts, CMS deployment and secrets.
- Remove global admin/MP/print fallbacks and unversioned routes.
- Contract deprecated columns and legacy tables in a separate migration after backup.
- Re-run full contract, isolation, migration and regression suites.

**Exit gate**: no Strapi traffic, no global credential access, no legacy contract consumers and owner acceptance recorded.

**Rollback**: destructive cleanup requires fresh backup and forward migration; it is not deployed with source cutover.

## Current-to-Target Data Map

| Current source | Target | Transformation |
|---|---|---|
| `admin_users` | `users`, `user_sessions`, `tenant_memberships` | preserve password hash, attach verified email from manifest, force re-auth |
| hardcoded identity/config | `tenants`, `tenant_settings`, `tenant_locations` | seed initial values and remove UI/ticket constants |
| initial commercial plan from manifest | `plan_definitions`, `tenant_entitlement_snapshots` | validate active `plan_id`/version and persist the tenant's immutable operational entitlement snapshot |
| Strapi categories | `catalog_categories` | normalized tenant-local name/order/status; store source mapping |
| Strapi menu items | `catalog_items` + `media_assets` | convert integer prices to decimals; copy/checksum image |
| Strapi combos + relation | `catalog_combos`, `combo_items` | preserve explicit combo price and item membership |
| no add-ons | `addon_groups`, `addon_options`, joins | empty for initial import; managed in new dashboard |
| `temporary_carts` JSON | `carts`, `cart_lines`, options | assign tenant/location and preserve official snapshots |
| `checkout_payments` | `payment_attempts`, provider routes/webhook events | tenant-scope ids and idempotency; move print state out |
| `orders` | `orders`, lines/options/events | tenant purchase sequence; reconstruct immutable detail from cart |
| `print_jobs` | tenant/location jobs + attempts | preserve payload/status and introduce lease |
| `MP_ACCESS_TOKEN` | no target record | do not import; keep only in the pre-cutover legacy release and require initial-tenant OAuth before switching payments |
| `PRINT_SERVICE_TOKEN` | `print_agents` digest | rotate to scoped token; temporary compatibility only |

The executable modes and blocking rules are in [migration-contract.md](contracts/migration-contract.md).

## Database and Migration Controls

- Generate and review SQL migrations; use `drizzle-kit migrate` or a controlled migration job over `DATABASE_DIRECT_URL`.
- Keep `db:push` development-only.
- Run the same migration and RLS compatibility suite against PostgreSQL 17 ephemeral CI, Neon development and Azure staging; only Azure staging gates production.
- Keep Neon development, Azure staging and Azure production in independent OpenTofu states and reject provider/environment mismatches during plan.
- Never load production backups, secrets or identifiable records into Neon; migration rehearsals use Azure staging or approved anonymized fixtures.
- Use a standard PostgreSQL connection adapter for application code; Neon-specific transport cannot be required by domain or migration code.
- Execute Azure migration and role-bootstrap jobs from an identity/network path authorized to the private database; do not open production PostgreSQL for workstation access.
- Split table expansion, data backfill, constraint validation and contraction into separate releases.
- Add populated-table foreign keys as `NOT VALID`, validate after reconciliation and only then enforce non-null.
- Use concurrent index creation for large indexes where transaction boundaries permit.
- Store progress by stable UUID/cursor and make every batch restartable.
- Never hold one transaction for the complete data migration.
- Test RLS with the actual runtime role, including missing context and table owner checks.
- Require schema-drift and pending-migration checks in CI.

## Contract and Consumer Rollout

1. Publish OpenAPI v1 and producer tests.
2. Deploy Core endpoints alongside legacy endpoints.
3. Use the guarded mock fixture only for Core development until `komanda-business` is functional; it sends the same stable `plan_id`, owner/business data, idempotency key and contract version.
4. Update `komanda-business` independently to replace the fixture as the real consumer; it never reads or writes the Core database.
5. Update the Python agent to the v1 claim/result contract and issue scoped credential.
6. Observe consumer/version telemetry.
7. Announce retirement window.
8. Remove legacy adapters only at Release 7.

Breaking changes require `/api/v2`; additive fields remain optional until all consumers upgrade.

## Testing Strategy

### Unit

- slug/email normalization;
- readiness and tenant state rules;
- plan activation/version selection and entitlement evaluation;
- single-use identity verification challenge issuance, expiry and consumption;
- default-deny enforcement for the three initial entitlement flags;
- catalog/add-on/combo validation;
- pricing snapshots;
- order/payment/print transition matrices;
- encryption envelope and redaction;
- idempotency-key construction.

### Integration

- apply the complete migration chain and role bootstrap to PostgreSQL 17 ephemeral CI, Neon development and Azure staging;
- assert equivalent RLS denials, transaction-local context, idempotency and schema invariants across all three targets;
- validate Azure private DNS/TLS/runtime connectivity from the staging deployment path rather than from a privileged workstation;
- atomic provisioning rollback, including unknown/inactive `plan_id` rejection, versioned plan seed availability, entitlement snapshot creation and pending identity state;
- production rejection and idempotent replay of the one-tenant mock bootstrap fixture;
- RLS and composite foreign keys under runtime role;
- cart revalidation and immutable order lines;
- OAuth token storage/refresh/revoke with provider stub;
- webhook signature, routing and replay;
- outbox creation in the same transaction;
- print leases and concurrent claims;
- migration rerun/reconciliation.

### Contract

- every OpenAPI operation has a producer test;
- `komanda-business` consumer fixtures cover supported contract versions, valid plans and invalid/inactive-plan failures;
- problem responses and 404 non-disclosure are stable;
- compatibility adapters match initial-tenant v1 semantics;
- print worker fixtures validate both directions.

### End-to-end

- seven user stories from the spec with tenants A/B;
- initial-tenant regression;
- Strapi-off post-cutover run;
- dependency-failure and reconnect runs.

### Load

- run production-sizing evidence against Azure staging; Neon results are diagnostic only;
- 100 seeded tenants, 50 concurrent operators;
- storefront reads, cart validation, order dashboard and SSE cursors;
- monitor p50/p95/p99 latency, pool wait, query counts, locks and error rate.

## Observability and Operations

- Generate/propagate `correlation_id` at every HTTP, webhook, outbox and print boundary.
- Log safe `tenant_id`, actor kind/id, operation, result, latency and retry count.
- Never log OAuth tokens, webhook secrets, agent tokens, customer snapshots or raw provider payloads.
- Metrics: provisioning success/rollback by safe `plan_id`/contract version, entitlement resolution failures, RLS denials, cross-tenant relationship violations, catalog latency, checkout/provider latency, webhook lag/replays, order-event lag, print queue depth/lease expiry and migration reconciliation differences.
- Alerts: any cross-tenant denial anomaly, missing tenant context, webhook mismatch, credential decrypt failure, outbox age, print queue age and migration blocker.
- Health checks separate database, object storage, Mercado Pago and outbox/printing so degraded modes are visible.

## Risk Register

| Risk | Mitigation | Release gate |
|---|---|---|
| Existing orphan/inconsistent data blocks non-null/FKs | preflight, batch mapping, explicit exception file, NOT VALID then validate | Release 2 |
| RLS silently bypassed by owner connection | separate runtime role, FORCE RLS, CI role audit | Releases 1–3 |
| Neon development hides Azure-specific role, network or pooling failure | Azure staging parity gate, provider-neutral driver and cross-target migration/RLS suite | Every database release |
| Production data or credentials leak into Neon | synthetic fixtures only, environment guardrails and automated secret/data provenance checks | Every non-production refresh |
| Tenant context leaks through route/header | trusted context factory, no public constructor, cross-id matrix | Release 3 |
| Media copy leaves broken storefront | checksum, status, shadow-read and 100% published-media gate | Release 4 |
| OAuth token refresh/revoke interrupts checkout | encrypted refresh flow, health state, actionable readiness | Release 5 |
| Webhook retry duplicates order/print | persisted event/resource route + tenant idempotency | Release 5 |
| Worker dies after claim | lease expiry, attempts and idempotent result | Release 5 |
| Full-order SSE polling exhausts database | incremental sequence/cursor and load test | Releases 3/6 |
| Strapi rollback after new Core writes diverges | only pre-write source rollback; post-write Core-compatible rollback | Release 4 |
| Cleanup removes a live consumer | version telemetry and zero-usage retirement gate | Release 7 |
| Commercial plan catalog drifts between repositories | stable `plan_id`, Core-owned version/status validation, immutable snapshot and producer/consumer contract fixtures | Releases 1/3/6 |

## Complexity Tracking

No constitutional violations or exceptions. The additional runtime role, RLS, outbox and migration journal are required controls for tenant isolation and reversible state migration, not optional architecture expansion.
