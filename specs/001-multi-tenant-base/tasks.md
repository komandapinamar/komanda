# Tasks: Plataforma multi-tenant autoservicio

**Input**: Design documents from `/specs/001-multi-tenant-base/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Tests are mandatory because this feature changes cross-repository contracts, tenant isolation, provisioning, checkout, payments, orders, printing and state migration.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as an independent increment. All paths belong to Komanda Core; `komanda-business` work is represented only by contract fixtures and compatibility evidence.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes a different file and has no dependency on another incomplete task in the same phase.
- **[Story]**: Maps the task to a user story in [spec.md](spec.md).
- Every task names the exact file or directory it must create or modify.

## Phase 1: Setup and safety harness

**Purpose**: Establish repeatable tooling and characterize the current single-tenant behavior before changing persistence or contracts.

- [X] T001 Add direct `zod`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@playwright/test` and YAML contract-validation dependencies in `src/package.json` and lock them in `src/package-lock.json`
- [X] T002 [P] Configure unit, integration and contract test projects in `src/vitest.config.ts` and shared setup in `src/tests/setup.ts`
- [X] T003 [P] Configure two-tenant browser projects and web-server lifecycle in `src/playwright.config.ts`
- [X] T004 [P] Document isolated pooled/direct database URLs, runtime role, object storage, encryption, provider test variables and the production prohibition for mock bootstrap in `src/.env.test.example`
- [X] T005 [P] Add pytest tooling and fake-printer test dependencies in `print-service/requirements-print.txt` and `print-service/pytest.ini`
- [X] T006 Add lint, typecheck, unit, integration, contract, isolation, E2E, guarded mock-tenant seed, migration and load commands to `src/package.json`
- [X] T007 [P] Capture current storefront, cart, checkout, payment, order, dashboard and print behavior as characterization tests in `src/tests/regression/initial-tenant.spec.ts`
- [X] T008 Add independent Core CI jobs for static checks, PostgreSQL integration, browser tests and print-worker tests in `.github/workflows/core-ci.yml`

**Checkpoint**: The current single-business flows have a reproducible safety harness and no production data is used by tests.

---

## Phase 2: Foundational tenant and security infrastructure

**Purpose**: Build the shared isolation, identity, transaction and diagnostic primitives that block every user story.

**⚠️ CRITICAL**: No user-story implementation begins until this phase passes with the real runtime database role.

- [X] T009 Split the schema entrypoint while preserving legacy exports in `src/db/schema/index.ts`, `src/db/schema/legacy.ts` and `src/db/schema.ts`
- [X] T010 Create tenant, location, user, single-use identity challenge, session, membership, settings and counter tables with tenant-first constraints in `src/db/schema/platform.ts`
- [X] T011 Create additive platform expansion, migration-owner/runtime roles and grants plus a role-verification CLI in `src/drizzle/0003_multitenant_platform_expand.sql` and `src/scripts/verify-database-roles.ts`
- [X] T012 [P] Define the trusted `TenantContext`, actor/source variants and construction boundary in `src/lib/tenant-context/types.ts`
- [X] T013 [P] Implement RFC 9457-style problem responses and non-disclosing not-found helpers in `src/lib/http/problem.ts`
- [X] T014 [P] Implement tenant-qualified idempotency key storage and replay semantics in `src/lib/idempotency/idempotency.service.ts`
- [X] T015 [P] Implement AES-256-GCM secret envelopes with tenant/provider AAD and key versions in `src/lib/encryption/secret-envelope.ts`
- [X] T016 [P] Define the S3-compatible media interface and presigned-upload adapter boundary in `src/lib/object-storage/object-storage.ts`
- [X] T017 [P] Add correlation IDs, safe tenant fields and secret/PII redaction in `src/lib/observability/request-context.ts`
- [X] T018 Create append-only audit, transactional outbox and persisted idempotency tables plus transaction-scoped writers and RLS in `src/db/schema/events.ts`, `src/db/schema/audit.ts`, `src/lib/audit/audit.service.ts`, `src/lib/outbox/outbox.service.ts` and `src/drizzle/0004_multitenant_foundation_events.sql`
- [X] T019 Implement pooled `withTenantTransaction()` using transaction-local `set_config` and a non-owner runtime client in `src/db/tenant-transaction.ts` and `src/db/index.ts`
- [X] T020 Implement public, administrative, webhook, agent, background and maintenance context resolvers in `src/lib/tenant-context/resolvers.ts`
- [X] T021 Replace global admin-token authority with revocable session and live membership services in `src/features/identity/application/session.service.ts`
- [X] T022 Create deterministic tenant A/B isolation fixtures plus a separate one-tenant non-production bootstrap that reuses the provisioning schema/service in `src/tests/fixtures/multitenant.ts`, `src/tests/fixtures/mock-provisioning.ts`, `src/scripts/seed-multitenant-acceptance.ts` and `src/scripts/seed-mock-tenant.ts`
- [X] T023 Verify default-deny RLS, `FORCE ROW LEVEL SECURITY`, composite FK rejection, missing context and role ownership in `src/tests/tenant-isolation/foundation.integration.test.ts`

**Checkpoint**: The foundation resolves one verified tenant, executes through the runtime role, fails closed and records safe diagnostics.

---

## Phase 3: User Story 1 — Aprovisionar y preparar un negocio registrado externamente (Priority: P1) 🎯 Technical Slice

**Goal**: Accept a trusted versioned request from `komanda-business`, provision all operational ownership atomically, verify the owner through Core and hand them into tenant-scoped onboarding with sales still disabled.

**Independent Test**: Submit valid requests for two businesses plus duplicate, invalid-plan and forced-failure requests; Core creates exactly one complete isolated aggregate per valid request, consumes only Core-issued verification challenges, leaves sales disabled and creates no partial records for failures.

### Tests for User Story 1

- [X] T024 [P] [US1] Add producer-contract coverage for real-consumer and mock-fixture provisioning payloads, email verification, sessions, tenant listing and readiness without activation in `src/tests/contract/provisioning.contract.test.ts`
- [X] T025 [P] [US1] Add atomic rollback, idempotent replay, existing-user, concurrent normalized-slug, single-use verification and production mock-bootstrap rejection cases in `src/tests/integration/provisioning.integration.test.ts`
- [X] T026 [P] [US1] Add tenant switching, revoked membership and known foreign-tenant ID denial cases in `src/tests/tenant-isolation/administration.integration.test.ts`

### Implementation for User Story 1

- [X] T027 [P] [US1] Define and seed reviewed plan definitions with `catalog_management`, `online_payments` and `printing` flags plus immutable snapshots and RLS in `src/db/schema/entitlements.ts` and `src/drizzle/0005_provisioning_entitlements.sql`
- [X] T028 [P] [US1] Define provisioning, email-verification, plan, entitlement and handoff validation schemas in `src/features/provisioning/domain/provisioning.schemas.ts`
- [X] T029 [US1] Implement migration-managed plan-version resolution and a default-deny application-service entitlement guard in `src/features/entitlements/application/entitlement.service.ts`
- [X] T030 [US1] Implement atomic pending owner, verification challenge, tenant, location, membership, settings, snapshot and idempotency persistence in `src/features/provisioning/infrastructure/provisioning.repository.ts`
- [X] T031 [US1] Orchestrate provisioning rollback, Core-issued/consumed verification challenges, delivery-port invocation and single-use onboarding handoffs in `src/features/provisioning/application/provision-tenant.service.ts`, `src/features/identity/application/identity-verification.service.ts` and `src/features/identity/infrastructure/verification-delivery.port.ts`
- [X] T032 [P] [US1] Authenticate and rotate the `komanda-business` service credential without trusting browser input in `src/features/identity/application/service-auth.service.ts`
- [X] T033 [US1] Expose service-authenticated provisioning and public single-use verification confirmation in `src/app/api/v1/provisioning/tenants/route.ts` and `src/app/api/v1/auth/email-verifications/confirm/route.ts`
- [X] T034 [US1] Expose create/revoke session adapters in `src/app/api/v1/auth/sessions/route.ts` and `src/app/api/v1/auth/sessions/current/route.ts`
- [X] T035 [US1] Expose authorized tenant listing and readiness without enabling sales in `src/app/api/v1/tenants/route.ts` and `src/app/api/v1/tenants/[tenantId]/readiness/route.ts`
- [X] T036 [US1] Implement tenant selection, persistent active-tenant layout and readiness onboarding pages in `src/app/(admin)/admin/select-business/page.tsx`, `src/app/(admin)/admin/[tenantId]/layout.tsx` and `src/app/(admin)/admin/[tenantId]/onboarding/page.tsx`
- [X] T037 [US1] Validate the one-tenant mock bootstrap for local development plus provisioning, Core-owned verification, tenant switching and onboarding/readiness for separate A/B fixtures while sales remain disabled in `src/tests/e2e/provisioning-and-onboarding.spec.ts`

**Checkpoint**: US1 provisions and verifies isolated tenants and exposes onboarding/readiness without activating sales or requiring acquisition UI inside Core.

---

## Phase 4: User Story 2 — Administrar el catálogo propio (Priority: P1)

**Goal**: Let an owner manage categories, items, add-ons, combos and media for only the active tenant, with safe archival and optimistic concurrency.

**Independent Test**: Build different catalogs for tenants A and B, publish changes in A, attempt cross-tenant and stale-version writes, and verify only A changes while historical references remain valid.

### Tests for User Story 2

- [X] T038 [P] [US2] Add producer-contract tests for category, item, add-on, combo and media operations in `src/tests/contract/catalog-admin.contract.test.ts`
- [X] T039 [P] [US2] Add cross-tenant IDs, mixed-tenant relationships and optimistic-version conflicts in `src/tests/tenant-isolation/catalog.integration.test.ts`
- [X] T040 [P] [US2] Add publishing, archival, invalid-combo, add-on-bound and missing `catalog_management` denial cases in `src/tests/integration/catalog-rules.integration.test.ts`

### Implementation for User Story 2

- [X] T041 [US2] Define media, category, item, add-on, join and combo tables with composite tenant FKs and RLS in `src/db/schema/catalog.ts` and `src/drizzle/0006_multitenant_catalog.sql`
- [X] T042 [P] [US2] Implement catalog state, readiness, add-on bounds, combo composition and archival rules in `src/features/catalog/domain/catalog.rules.ts`
- [X] T043 [US2] Implement transaction-scoped catalog queries and compare-and-set updates in `src/features/catalog/infrastructure/catalog.repository.ts`
- [X] T044 [US2] Implement tenant-aware catalog CRUD, historical-safety orchestration and `catalog_management` entitlement enforcement in `src/features/catalog/application/catalog.service.ts`
- [X] T045 [P] [US2] Implement checksum-verified presigned uploads and tenant-prefixed storage keys in `src/features/catalog/infrastructure/media.repository.ts`
- [X] T046 [US2] Expose category list/create/update/archive operations in `src/app/api/v1/tenants/[tenantId]/catalog/categories/route.ts` and `src/app/api/v1/tenants/[tenantId]/catalog/categories/[categoryId]/route.ts`
- [X] T047 [US2] Expose item list/create/update/archive operations in `src/app/api/v1/tenants/[tenantId]/catalog/items/route.ts` and `src/app/api/v1/tenants/[tenantId]/catalog/items/[itemId]/route.ts`
- [X] T048 [US2] Expose add-on group create/update/archive operations in `src/app/api/v1/tenants/[tenantId]/catalog/addon-groups/route.ts` and `src/app/api/v1/tenants/[tenantId]/catalog/addon-groups/[addonGroupId]/route.ts`
- [X] T049 [US2] Expose combo create/update/archive operations in `src/app/api/v1/tenants/[tenantId]/catalog/combos/route.ts` and `src/app/api/v1/tenants/[tenantId]/catalog/combos/[comboId]/route.ts`
- [X] T050 [US2] Expose media upload creation and completion in `src/app/api/v1/tenants/[tenantId]/media/uploads/route.ts` and `src/app/api/v1/tenants/[tenantId]/media/[assetId]/complete/route.ts`
- [X] T051 [US2] Build tenant-scoped catalog editors with conflict feedback in `src/app/(admin)/admin/[tenantId]/catalog/page.tsx` and `src/features/catalog/web/CatalogEditor.tsx`
- [X] T052 [US2] Validate independent A/B catalog publication and first-use workflow in `src/tests/e2e/catalog-administration.spec.ts`

**Checkpoint**: US2 manages a complete tenant catalog in Core without Strapi writes or cross-tenant visibility.

---

## Phase 5: User Story 3 — Comprar en la tienda del negocio correcto (Priority: P1)

**Goal**: Resolve a public tenant, serve its catalog, maintain tenant-bound carts and revalidate checkout without customer accounts.

**Independent Test**: Shop simultaneously in A and B, reuse A cart identifiers under B, change catalog after cart creation and suspend a tenant; only valid same-tenant confirmed selections proceed.

### Tests for User Story 3

- [X] T053 [P] [US3] Add producer-contract tests for public catalog, cart create/read and payment-session input in `src/tests/contract/storefront-cart.contract.test.ts`
- [X] T054 [P] [US3] Add cart/catalog composite-FK, foreign slug/ID and missing-context denial cases in `src/tests/tenant-isolation/storefront-cart.integration.test.ts`
- [X] T055 [P] [US3] Add stale price, availability, combo and add-on revalidation cases in `src/tests/integration/cart-revalidation.integration.test.ts`

### Implementation for User Story 3

- [X] T056 [US3] Define carts, cart lines and selected option snapshots with tenant/location ownership and RLS in `src/db/schema/commerce.ts` and `src/drizzle/0007_multitenant_carts.sql`
- [X] T057 [P] [US3] Normalize hosts and versioned storefront paths without performing authorization in `src/proxy.ts`
- [X] T058 [US3] Resolve active public tenants and same-tenant public catalog projections in `src/features/tenancy/application/public-tenant.service.ts`
- [X] T059 [US3] Implement cart persistence, pricing snapshots, expiry and tenant-qualified optimistic updates in `src/features/cart/infrastructure/cart.repository.ts`
- [X] T060 [US3] Implement cart creation, separation and pre-payment revalidation in `src/features/cart/application/cart.service.ts`
- [X] T061 [US3] Expose public catalog and cart create/read endpoints in `src/app/api/v1/storefronts/[tenantSlug]/catalog/route.ts`, `src/app/api/v1/storefronts/[tenantSlug]/carts/route.ts` and `src/app/api/v1/storefronts/[tenantSlug]/carts/[cartId]/route.ts`
- [X] T062 [US3] Adapt storefront menu rendering to Core public catalog projections in `src/features/shop/menu/services/menu.service.ts` and `src/app/page.tsx`
- [X] T063 [US3] Scope browser cart state by normalized tenant slug and invalidate it on tenant changes in `src/features/shop/cart/context/cart.context.tsx`
- [X] T064 [US3] Adapt checkout validation to the application service and preserve customer-confirmed snapshots in `src/features/shop/checkout/services/checkout.service.ts`
- [X] T065 [US3] Validate A/B shopping, stale-cart confirmation, unavailable tenants and suspension in `src/tests/e2e/storefront-checkout.spec.ts`

**Checkpoint**: US3 supports tenant-safe browsing and checkout preparation; payment provider behavior remains behind an application port.

---

## Phase 6: User Story 4 — Conectar cobros y configurar la operación por negocio (Priority: P1)

**Goal**: Maintain tenant settings and Mercado Pago seller authorization, route every payment through the correct account and process callbacks idempotently.

**Independent Test**: Connect different seller accounts for A and B, create payments, replay and reorder signed callbacks, revoke B and verify no credential or operation crosses tenant boundaries.

### Tests for User Story 4

- [X] T066 [P] [US4] Add producer-contract tests for settings, OAuth, integration status, payment sessions and webhooks in `src/tests/contract/payments.contract.test.ts`
- [X] T067 [P] [US4] Add encryption round-trip, key rotation, AAD mismatch and response-redaction cases in `src/tests/unit/secret-envelope.test.ts`
- [X] T068 [P] [US4] Add seller/cart/resource mismatch, signature, replay and out-of-order callback cases in `src/tests/tenant-isolation/payment-webhook.integration.test.ts`
- [X] T069 [P] [US4] Add provider timeout, retry, approved-payment idempotency, OAuth-only and missing `online_payments` denial cases in `src/tests/integration/payment-lifecycle.integration.test.ts`

### Implementation for User Story 4

- [X] T070 [US4] Add integration accounts, provider resource routes, payment attempts, webhook events and least-privilege policies in `src/db/schema/integrations.ts`, `src/db/schema/commerce.ts` and `src/drizzle/0008_multitenant_payments.sql`
- [X] T071 [P] [US4] Implement Mercado Pago OAuth, refresh, revoke and health-check provider calls in `src/features/payments/infrastructure/mercadopago-oauth.client.ts`
- [X] T072 [P] [US4] Implement signed webhook verification and sanitized provider payload parsing in `src/features/payments/infrastructure/mercadopago-webhook.verifier.ts`
- [X] T073 [US4] Persist encrypted tenant seller accounts and minimal global resource routes in `src/features/payments/infrastructure/integration.repository.ts`
- [X] T074 [US4] Implement settings compare-and-set, readiness and sales/printing preference updates in `src/features/tenancy/application/tenant-settings.service.ts`
- [X] T075 [US4] Implement OAuth-only start/callback/revoke and seller-account readiness orchestration with no manual-token path in `src/features/payments/application/integration.service.ts`
- [X] T076 [US4] Refactor payment-session creation to require `online_payments` and the cart tenant's active OAuth integration in `src/features/shop/payments/services/payment-session.service.ts`
- [X] T077 [US4] Refactor callback processing into a tenant-correlated idempotent transaction with outbox events in `src/features/shop/payments/server/payment-confirmation.service.ts`
- [X] T078 [US4] Expose tenant settings, OAuth integration and readiness-gated activation routes in `src/app/api/v1/tenants/[tenantId]/settings/route.ts`, `src/app/api/v1/tenants/[tenantId]/integrations/mercadopago/route.ts` and `src/app/api/v1/tenants/[tenantId]/activation/route.ts`
- [X] T079 [US4] Expose OAuth, payment-session and webhook adapters in `src/app/api/v1/tenants/[tenantId]/integrations/mercadopago/oauth/route.ts`, `src/app/api/v1/integrations/mercadopago/oauth/callback/route.ts`, `src/app/api/v1/storefronts/[tenantSlug]/carts/[cartId]/payment-sessions/route.ts` and `src/app/api/v1/integrations/mercadopago/webhooks/[routingKey]/route.ts`
- [X] T080 [US4] Build tenant settings, OAuth-only Mercado Pago status and final activation UI without redisplaying secrets in `src/app/(admin)/admin/[tenantId]/settings/page.tsx`, `src/app/(admin)/admin/[tenantId]/integrations/page.tsx` and `src/app/(admin)/admin/[tenantId]/onboarding/page.tsx`

**Checkpoint**: US4 routes every accepted payment and callback through one verified tenant seller account with redacted credentials.

---

## Phase 7: User Story 5 — Gestionar pedidos en curso (Priority: P1)

**Goal**: Create immutable orders, operate valid transitions and stream recoverable tenant-scoped changes to the dashboard.

**Independent Test**: Create paid and direct orders in A/B, try foreign IDs and invalid/repeated transitions, disconnect/reconnect the stream, and verify authoritative isolated state without duplicate effects.

### Tests for User Story 5

- [X] T081 [P] [US5] Add producer-contract tests for order list/detail/create/transition and event cursor operations in `src/tests/contract/orders.contract.test.ts`
- [X] T082 [P] [US5] Add transition matrix, immutable line snapshots and direct-order atomicity cases in `src/tests/integration/orders.integration.test.ts`
- [X] T083 [P] [US5] Add foreign order IDs, tenant-qualified numbering/idempotency and event-stream isolation cases in `src/tests/tenant-isolation/orders.integration.test.ts`

### Implementation for User Story 5

- [X] T084 [US5] Add orders, immutable lines/options, tenant-sequenced events and RLS to `src/db/schema/commerce.ts`, `src/db/schema/events.ts` and `src/drizzle/0009_multitenant_orders.sql`
- [X] T085 [P] [US5] Implement fulfillment/payment transition matrices and terminal-state rules in `src/features/orders/domain/order.rules.ts`
- [X] T086 [US5] Implement tenant-scoped order, counter, immutable-line and event persistence in `src/features/orders/infrastructure/order.repository.ts`
- [X] T087 [US5] Implement paid-order and direct-order creation with audit, print intent and outbox in `src/features/orders/application/create-order.service.ts`
- [X] T088 [US5] Implement compare-and-set transitions and duplicate-effect prevention in `src/features/orders/application/transition-order.service.ts`
- [X] T089 [US5] Expose order list/direct-create, detail/transition and incremental events in `src/app/api/v1/tenants/[tenantId]/orders/route.ts`, `src/app/api/v1/tenants/[tenantId]/orders/[orderId]/route.ts` and `src/app/api/v1/tenants/[tenantId]/orders/events/route.ts`
- [X] T090 [US5] Replace full-list polling with cursor-based tenant SSE and reconnect replay in `src/features/admin-panel/components/AdminOrdersLive.tsx`
- [X] T091 [US5] Build tenant-scoped order list/detail/direct-order controls in `src/app/(admin)/admin/[tenantId]/orders/page.tsx`
- [X] T092 [US5] Adapt legacy payment and direct-order callers to the new order application services in `src/features/shop/payments/server/admin-direct-order.service.ts` and `src/features/shop/checkout/server/order.service.ts`
- [X] T093 [US5] Validate A/B order creation, operation, denial and stream recovery in `src/tests/e2e/order-dashboard.spec.ts`

**Checkpoint**: US5 operates live orders per tenant and preserves accepted commercial snapshots.

---

## Phase 8: User Story 6 — Imprimir tickets dentro del alcance autorizado (Priority: P2)

**Goal**: Enroll tenant/location agents and deliver recoverable leased print jobs exactly once at the logical level.

**Independent Test**: Run A/B agents against simultaneous jobs, kill one after claim, replay results and revoke its token; each receives only its scope and pending work recovers without altering orders or payments.

### Tests for User Story 6

- [X] T094 [P] [US6] Add producer-contract tests for enrollment, claim and idempotent result reporting in `src/tests/contract/printing.contract.test.ts`
- [X] T095 [P] [US6] Add concurrent claim, lease expiry, repeated result, cross-agent and missing `printing` entitlement denial cases in `src/tests/tenant-isolation/printing.integration.test.ts`
- [X] T096 [P] [US6] Add client, renderer, fake-printer and retry tests in `print-service/tests/test_worker.py`

### Implementation for User Story 6

- [X] T097 [US6] Define print agents, jobs and attempts with tenant/location composite FKs, lease indexes and RLS in `src/db/schema/printing.ts` and `src/drizzle/0010_multitenant_printing.sql`
- [X] T098 [P] [US6] Implement token prefix lookup, digest verification, issuance, rotation and revocation in `src/features/printing/application/print-agent.service.ts`
- [X] T099 [US6] Implement `SKIP LOCKED` claim, lease recovery, attempts and idempotent result persistence in `src/features/printing/infrastructure/print-job.repository.ts`
- [X] T100 [US6] Implement `printing` entitlement enforcement, tenant-branding payload construction and failure isolation from payment/order state in `src/features/printing/application/print-job.service.ts`
- [X] T101 [US6] Expose agent enrollment, scoped claim and result routes in `src/app/api/v1/tenants/[tenantId]/print-agents/route.ts`, `src/app/api/v1/print/jobs/claim/route.ts` and `src/app/api/v1/print/jobs/[jobId]/result/route.ts`
- [X] T102 [US6] Split the Python worker into versioned client, renderer and printer adapters in `print-service/komanda_print/client.py`, `print-service/komanda_print/renderer.py` and `print-service/komanda_print/printer.py`
- [X] T103 [US6] Update the worker loop for scoped bearer auth, lease-aware retries and idempotent reports in `print-service/print_worker.py`
- [X] T104 [US6] Add print enrollment, status and actionable failure UI in `src/app/(admin)/admin/[tenantId]/integrations/printing/page.tsx`
- [X] T105 [US6] Validate disconnect/reconnect, revocation and one-effective-print behavior in `src/tests/e2e/printing.spec.ts`

**Checkpoint**: US6 contains physical print effects within the authorized tenant and location and safely recovers abandoned work.

---

## Phase 9: User Story 7 — Migrar el negocio actual y retirar Strapi (Priority: P2)

**Goal**: Convert the current business into the initial tenant, reconcile all operational/catalog/media data, cut over safely and remove Strapi as an operational dependency.

**Independent Test**: Rehearse the migration twice over an anonymized snapshot, inject blockers, reconcile checksums, cut over in a disposable environment and run all initial-tenant flows with Strapi stopped.

### Tests for User Story 7

- [X] T106 [P] [US7] Add manifest validation, orphan detection and blocking-preflight fixtures in `src/tests/migration/preflight.integration.test.ts`
- [X] T107 [P] [US7] Add repeatable operational/catalog/media import and checksum cases in `src/tests/migration/import.integration.test.ts`
- [X] T108 [P] [US7] Add reconciliation blockers, approved exceptions and two-tenant gate cases in `src/tests/migration/reconcile.integration.test.ts`
- [X] T109 [P] [US7] Add pre-write rollback, post-write forward-fix and Strapi-off cutover cases in `src/tests/migration/cutover.integration.test.ts`

### Implementation for User Story 7

- [X] T110 [US7] Define migration run/record journals, maintenance-only grants and progress indexes in `src/db/schema/migration.ts` and `src/drizzle/0011_migration_journal.sql`
- [X] T111 [P] [US7] Define the versioned secret-free initial-tenant manifest and validation codes in `src/scripts/migration/manifest.ts`
- [X] T112 [US7] Implement source connectivity, schema/version, count, orphan and media preflight checks in `src/scripts/migration/preflight.ts`
- [X] T113 [US7] Implement idempotent batched backfill of carts, payments, orders and print jobs with checkpoints in `src/scripts/migration/import-operational.ts`
- [X] T114 [US7] Implement Strapi category, item, combo and relation import with stable source mappings in `src/scripts/migration/import-catalog.ts`
- [X] T115 [US7] Implement object-storage media copy, checksum verification and failure classification in `src/scripts/migration/import-media.ts`
- [X] T116 [US7] Implement initial user/hash, tenant, location, migration-managed plan snapshot, settings and print compatibility seeding without importing Mercado Pago tokens in `src/scripts/migration/seed-initial-tenant.ts`
- [X] T117 [US7] Implement deterministic count/checksum, invariant and exception reconciliation reports in `src/scripts/migration/reconcile.ts`
- [X] T118 [US7] Implement freeze, final delta, mandatory initial-tenant OAuth check, smoke gate, read-source switch and rollback recording in `src/scripts/migration/cutover.ts`
- [X] T119 [US7] Add legacy tenant/location backfill, composite `NOT VALID` constraints, validation, non-null and RLS enforcement in `src/drizzle/0012_multitenant_backfill.sql` and `src/drizzle/0013_multitenant_enforce.sql`
- [X] T120 [US7] Keep initial-tenant legacy adapters explicit, flagged and instrumented during the compatibility window in `src/lib/tenant-context/legacy-initial-tenant.ts`
- [X] T121 [US7] Add CLI commands for preflight, import, reconcile, cutover and dry-run modes in `src/package.json`
- [X] T122 [US7] Validate initial-owner access, OAuth-connected payments, storefront, checkout, order, dashboard and printing with Strapi stopped and no imported global payment token in `src/tests/e2e/initial-tenant-cutover.spec.ts`

**Checkpoint**: US7 produces reconciled cutover evidence, retains a valid rollback boundary and leaves Core as the only catalog authority.

---

## Phase 10: Polish, release gates and legacy cleanup

**Purpose**: Prove scale, fault containment, contract compatibility and safe retirement across the completed stories.

- [X] T123 [P] Add provisioning-under-5-seconds plus 100-tenant/50-operator storefront, catalog, order and SSE workloads with percentile assertions in `src/tests/load/multitenant.js`
- [X] T124 [P] Add acquisition, Mercado Pago, object-storage, print and Strapi outage scenarios in `src/tests/integration/degraded-modes.integration.test.ts`
- [X] T125 [P] Add a static architecture test preventing domain/application imports from Next.js adapters in `src/tests/architecture/layer-boundaries.test.ts`
- [X] T126 [P] Validate every operation and local reference in the published OpenAPI document from `specs/001-multi-tenant-base/contracts/openapi.yaml` in `src/tests/contract/openapi-document.test.ts`
- [X] T127 Generate producer and future `komanda-business` consumer compatibility evidence from the same temporary mock payload in `src/tests/contract/fixtures/komanda-business/` and `artifacts/001-multi-tenant-base/contracts.md`
- [X] T128 Verify secret, PII and cross-tenant data redaction across responses, logs, audit and outbox payloads in `src/tests/security/redaction.integration.test.ts`
- [X] T129 Verify tenant-first index use, query counts, pool waits and absence of full-order polling in `src/tests/performance/query-budgets.integration.test.ts`
- [ ] T130 Execute every command and record every expected result from `specs/001-multi-tenant-base/quickstart.md` in `artifacts/001-multi-tenant-base/quickstart-report.md`
- [X] T131 Document deployment order, compatibility windows, health checks, degraded modes and rollback decisions in `README.md` and `src/README.md`
- [X] T132 Remove Strapi reads, global admin/MP/print fallbacks and the enumerated legacy routes in `src/features/shop/menu/services/menu.service.ts`, `src/app/api/cart/`, `src/app/api/payments/`, `src/app/api/orders/`, `src/app/api/print-jobs/` and `src/app/api/admin/orders/stream/`
- [X] T133 Remove deprecated columns and legacy tables behind an empty-database guard in `src/drizzle/0015_multitenant_contract_cleanup.sql`
- [X] T134 [P] Implement dependency-specific liveness/readiness probes for database, object storage, Mercado Pago, outbox and printing in `src/lib/observability/health.ts` and `src/app/api/health/route.ts`
- [X] T135 [P] Emit provisioning, entitlement, RLS-denial, webhook, order-event, outbox, print-lease and migration metrics in `src/lib/observability/metrics.ts`
- [X] T136 Restrict the pinned Neon/OpenTofu root to synthetic development only, with its own remote-state key and no staging/production variable files in `infra/database/neon/`
- [X] T137 Define pinned Azure PostgreSQL/OpenTofu infrastructure for private, independent staging and production databases with environment guardrails, protected state and production HA/backup requirements in `infra/database/azure/`
- [X] T138 Validate both database roots independently in CI and document the environment/state/apply matrix in `.github/workflows/infra-ci.yml` and `infra/database/README.md`
- [ ] T139 Replace the Neon-specific runtime transport with a provider-neutral PostgreSQL adapter and execute migration/RLS/idempotency compatibility suites against PostgreSQL 17 CI, Neon development and Azure staging in `src/db/index.ts`, `src/package.json` and `src/tests/database-compatibility/`
- [ ] T140 Provision Azure staging before production, run role bootstrap and migrations from the private deployment path, execute a restore drill and attach the reviewed plans/results in `artifacts/001-multi-tenant-base/database-environments.md`

**Checkpoint**: All production gates have attached evidence; cleanup occurs only after the seven-day pilot and zero-usage compatibility window.

---

## Dependencies and execution order

### Phase dependencies

- **Phase 1 — Setup**: no dependencies.
- **Phase 2 — Foundation**: depends on Phase 1 and blocks every user story.
- **US1–US6**: may start after Phase 2 with separate owners, using deterministic fixtures instead of depending on another story's UI.
- **US7**: its test/CLI scaffolding may start after Phase 2, but final import and cutover require the destination schemas and critical flows from US1–US6.
- **Phase 10 — Polish/cleanup**: performance and fault tests require the selected stories; destructive cleanup requires US7 Gate E and the documented pilot.

### User-story delivery dependencies

```text
Foundation
├── US1 Provisioning/onboarding
├── US2 Catalog administration ──► US3 Storefront/cart
├── US4 Tenant payments ─────────► US5 Paid-order lifecycle
├── US5 Orders ──────────────────► US6 Printing
└── US7 migration scaffolding

US1 + US2 + US3 + US4 + US5 + US6 ──► US7 final cutover ──► legacy cleanup
```

- **US1**: independently testable after Foundation as a technical provisioning/verification slice; it intentionally does not activate sales.
- **US2**: independently testable with seeded tenants; public value is consumed by US3.
- **US3**: independently testable with seeded catalog and a fake payment port; production checkout later uses US4.
- **US4**: independently testable with seeded carts and Mercado Pago stubs; approved payments feed US5.
- **US5**: independently testable with paid/direct-order fixtures; print intent feeds US6.
- **US6**: independently testable with seeded orders and fake printers.
- **US7**: independently testable on an anonymized snapshot, but production cutover is the integration gate for all earlier stories.

### Within each story

1. Write the listed contract, integration and isolation tests and confirm they fail for the expected reason.
2. Add schema/migration changes before repositories.
3. Implement domain rules before application orchestration.
4. Implement repositories before HTTP/UI adapters.
5. Pass the independent story test before integrating downstream stories.

## Parallel execution examples

- **US1**: T024, T025, T026, T027, T028 and T032 touch independent test/domain/auth files and can start together.
- **US2**: T038, T039 and T040 can run together; after T041, T042 and T045 can run in parallel.
- **US3**: T053, T054 and T055 can run together; T057 can proceed while cart persistence is implemented.
- **US4**: T066–T069 can run together; T071 and T072 can implement separate provider adapters in parallel.
- **US5**: T081–T083 can run together; T085 can proceed independently of schema persistence.
- **US6**: T094–T096 can run together; T098 can proceed independently of the print-job repository.
- **US7**: T106–T109 and T111 can start together using fixed manifest/snapshot fixtures.

## Implementation strategy

### Technical slice first

1. Complete Phase 1 and Phase 2.
2. Complete US1 through T037.
3. Demonstrate one deterministic local mock bootstrap and two separate isolated provisioning requests, Core-owned verification, invalid-plan rejection, entitlement snapshots, tenant switching and readiness with sales disabled.
4. Keep external registration UI in `komanda-business`; publish only the compatible Core contract and fixtures from this repository.

### Incremental delivery

1. Add US2 and US3 to deliver tenant-owned catalog plus public shopping.
2. Add US4 and US5 to deliver seller-specific payments plus operational orders.
3. Add US6 for scoped physical ticket fulfillment.
4. Rehearse and complete US7 only after every destination model and regression path exists.
5. Run Phase 10 gates, pilot for seven days and perform contract cleanup in a separate release.

### Contract rollout

1. Publish Core OpenAPI v1 and producer fixtures before enabling consumers.
2. Allow `komanda-business` and the Python agent to upgrade independently.
3. Observe version/deprecation telemetry through the agreed window.
4. Retire unversioned/global compatibility only after zero usage and rollback evidence.

## Notes

- `[P]` never means two tasks may edit the same file concurrently.
- All tenant-aware tests run with at least tenants A/B and the actual non-owner runtime role.
- Compatibility code may name the initial tenant explicitly but must never act as a general fallback.
- Migration and cleanup are separate releases; do not combine replacement and destructive contraction.
- Commit after each task or coherent dependency group and attach the relevant test evidence.
