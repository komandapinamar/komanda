# Quickstart Validation Guide: Plataforma multi-tenant autoservicio

This guide describes the runnable evidence required after implementation. It does not replace production migration approval.

## References

- [Feature specification](spec.md)
- [Implementation plan](plan.md)
- [Data model](data-model.md)
- [OpenAPI contract](contracts/openapi.yaml)
- [Tenant context contract](contracts/tenant-context.md)
- [Migration contract](contracts/migration-contract.md)

## Prerequisites

- Node.js 22 and npm 10;
- Python 3.11+ for the print agent;
- PostgreSQL 17 ephemeral database for local/CI tests;
- Neon development project containing synthetic data only;
- private Azure PostgreSQL staging instance that reproduces production migrations, roles, RLS, extensions and network path;
- S3-compatible test bucket;
- identity-verification capture sink for deterministic email/token assertions;
- Mercado Pago test application with OAuth and Webhook Simulator access;
- two test seller accounts;
- no production credentials or customer data.

The implementation must add `src/.env.test.example` and package scripts referenced below. The test database must use separate owner/migration and runtime roles so RLS is tested under production-equivalent privileges.

Database evidence is environment-specific:

| Purpose | Provider | Production gate? |
|---|---|---|
| Local and CI integration | PostgreSQL 17 ephemeral | No |
| Remote development and previews | Neon development | No |
| Preproduction acceptance | Azure PostgreSQL staging | Yes |
| Live business data | Azure PostgreSQL production | Destination only |

Neon must never receive production credentials, backups or identifiable records. A passing Neon suite does not replace Azure staging acceptance.

Validate both OpenTofu roots before application tests:

```bash
tofu -chdir=infra/database/neon init -backend=false
tofu -chdir=infra/database/neon validate
tofu -chdir=infra/database/azure/staging init -backend=false
tofu -chdir=infra/database/azure/staging validate
tofu -chdir=infra/database/azure/production init -backend=false
tofu -chdir=infra/database/azure/production validate
```

## 1. Install and validate static artifacts

```bash
cd src
npm ci
npm run lint
npm run typecheck
npm run test:contracts
```

Expected:

- OpenAPI parses and has no unresolved references;
- every versioned route implementation is covered by a producer contract test;
- domain packages do not import Next.js adapters;
- no secret-like values appear in generated snapshots.
- the provisioning contract requires `planId`, rejects unknown/inactive plans and returns the persisted entitlement snapshot;
- accepted plan definitions come from reviewed Core migrations and the three initial flags fail closed when absent or disabled;
- identity verification tokens are issued/consumed by Core and cannot be asserted by `komanda-business`;

## 2. Create an isolated database

```bash
cd src
cp .env.test.example .env.test
npm run db:migrate:test
npm run db:verify-roles:test
```

Expected:

- migrations apply from an empty database using `DATABASE_DIRECT_URL`;
- runtime tests use the pooled `DATABASE_URL`;
- runtime role does not own tables and has no `BYPASSRLS`;
- all tenant-owned tables have `tenant_id NOT NULL`, RLS enabled/forced and tenant-first indexes;
- rerunning migrations reports no pending change.
- the same migration and RLS suite passes against Neon development and Azure staging;
- Azure staging is reached through the same private deployment path intended for production;

Do not use `db:push` for this validation.

## 3. Run automated tests

```bash
cd src
npm run test:unit
npm run test:integration
npm run test:tenant-isolation
npm run test:contracts
npm run test:e2e
```

Expected:

- all suites pass;
- the isolation suite uses the real runtime role;
- retries of registration, payment confirmation, direct orders and print results are idempotent;
- catalog edits preserve order snapshots;
- suspended tenants cannot start new sales;
- the initial tenant regressions remain green.

## 4. Seed two acceptance tenants

For manual development while `komanda-business` is unavailable, create exactly one deterministic mock tenant through the production provisioning schema/service:

```bash
cd src
npm run seed:tenant:mock
```

Expected: the command is idempotent, prints only non-secret identifiers and hard-fails when `NODE_ENV=production`. It creates no implicit tenant fallback and is not isolation evidence.

For acceptance and isolation, always seed two independent tenants:

```bash
cd src
npm run seed:multitenant:acceptance
npm run dev
```

The seed prints only non-secret identifiers:

```text
TENANT_A_ID
TENANT_A_SLUG
TENANT_B_ID
TENANT_B_SLUG
OWNER_A_EMAIL
OWNER_B_EMAIL
PLAN_A_ID
PLAN_B_ID
PRINT_AGENT_A_TOKEN_FILE
PRINT_AGENT_B_TOKEN_FILE
```

Expected:

- each owner sees only their tenant;
- switching tenant is only available to a user with both memberships;
- tenant A and B have different catalogs, Mercado Pago seller accounts and print agents.

## 5. Cross-tenant denial matrix

```bash
cd src
npm run test:tenant-isolation -- --reporter=verbose
```

The report must prove:

1. A can read/write A and B can read/write B.
2. A cannot read, update or archive B catalog ids.
3. A cart cannot include an item/combo/add-on from B.
4. A payment attempt cannot reference B credentials or cart.
5. A webhook routing key and provider resource from different tenants modifies nothing.
6. A cannot view or transition B orders even with a known UUID.
7. A print agent cannot claim or report B jobs.
8. Jobs and cleanup without tenant context fail closed.
9. Database queries with missing `app.tenant_id` return no tenant-owned rows.
10. Errors and audit events expose no foreign customer/catalog data.

Expected: 100% denied with no target mutation.

## 6. End-to-end business journeys

```bash
cd src
npm run test:e2e -- --project=multitenant
```

Required journeys:

- a valid `komanda-business` contract request creates or links a pending owner + tenant + primary location + membership + entitlement snapshot atomically and returns the verification/onboarding handoff;
- Core consumes the single-use identity challenge and only then marks the owner verified; the technical slice leaves sales disabled;
- an unknown or inactive `plan_id` creates no partial identity, tenant, membership or entitlement data;
- catalog administration, online payments and printing are each rejected without their corresponding entitlement flag;
- owner creates category, item, add-on group and combo and activates storefront;
- customer buys from A while B remains unchanged;
- stale cart is revalidated after a price/availability change;
- owner connects Mercado Pago through OAuth and credentials never reappear;
- payment webhook creates exactly one order and print job;
- direct order keeps payment pending at counter;
- order transitions stream only to the selected tenant;
- print-agent disconnect/reconnect processes each job once;
- suspension blocks new sales but permits safe completion of an already approved payment.

## 7. Mercado Pago sandbox validation

1. Connect seller A and seller B through OAuth.
2. Use the Webhook Simulator for each configured integration.
3. Create one test payment per storefront.
4. Replay each notification and send one out of order.
5. Revoke seller B authorization.

Expected:

- no manual API-key/access-token input exists and the initial tenant must also complete OAuth;
- each attempt uses the seller account belonging to its tenant;
- `x-signature` is mandatory;
- replay returns an accepted/ignored idempotent result;
- seller B becomes non-ready and cannot create new payment sessions;
- tenant A remains operational;
- stored tokens, responses and logs remain redacted.

## 8. Print agent validation

```bash
cd print-service
python -m pytest
```

Then run two workers with separate temporary env files:

```bash
./run_worker.sh
```

Expected:

- each token derives tenant/location server-side;
- A receives only A ticket branding and order data;
- killing a worker after claim lets the lease expire and the job reappear;
- repeated success report does not print a second logical job;
- a revoked token receives 401 and no payload.

Use a fake printer adapter in automated tests; physical printer validation is a separate smoke step.

## 9. Legacy migration rehearsal

Use an anonymized snapshot and a read-only Strapi source.

```bash
cd src
npm run migrate:tenant:preflight -- --manifest ./migration/initial-tenant.test.json
npm run migrate:tenant:import -- --manifest ./migration/initial-tenant.test.json
npm run migrate:tenant:reconcile -- --manifest ./migration/initial-tenant.test.json
```

Expected:

- commands are idempotent and emit run ids;
- owner, operational data, catalog, media and the initial entitlement snapshot map to one tenant using a plan definition already deployed by Core;
- the legacy global Mercado Pago token is not imported into `integration_accounts`;
- source/target counts and checksums match;
- order lines reconstruct from carts;
- no orphan or cross-tenant relation exists;
- invalid fixtures block `cutover_ready` with actionable codes.

Repeat import and reconciliation. Expected: no duplicate rows and the same checksums.

## 10. Cutover rehearsal

```bash
cd src
npm run migrate:tenant:cutover -- --run-id <reconciled-run-id> --dry-run
npm run test:smoke:initial-tenant
```

In a disposable environment, repeat without `--dry-run` after freezing legacy writes.

Expected:

- final delta is imported and reconciled;
- storefront and dashboard operate with Strapi stopped;
- rollback before reopening writes restores the legacy read flag;
- after Core writes reopen, rollback uses a Core-compatible release and never reactivates Strapi as source-of-truth.

## 11. Performance and recovery

```bash
cd src
npm run test:load -- --tenants=100 --operators=50
npm run test:dependency-failures
```

Expected:

- at least 95% of storefront, catalog and order views return useful content within 2 seconds;
- at least 95% of order changes appear in the correct panel within 5 seconds;
- Mercado Pago outage blocks only new online payment sessions;
- print outage keeps jobs recoverable;
- acquisition-client outage does not affect existing tenant operations;
- Strapi outage after cutover has no impact;
- no connection-pool exhaustion or full-table order polling occurs.

## 12. Evidence required for production gate

Attach to the release:

- reviewed and applied Azure staging plan plus a reviewed, unapplied-or-approved Azure production plan;
- database compatibility report covering PostgreSQL 17 CI, Neon development and Azure staging;
- Azure staging restore drill with elapsed recovery time, counts and invariant checks;
- evidence that Neon contains no production credentials, backups or identifiable data;

- migration run and reconciliation reports;
- RLS/runtime-role verification output;
- producer contract report;
- `komanda-business` consumer compatibility report for supported provisioning versions and plan failures;
- two-tenant denial matrix;
- end-to-end and initial-tenant regression reports;
- load-test percentiles;
- dependency-failure results;
- backup/restore evidence;
- approved freeze, cutover and rollback timestamps;
- owner acceptance for the initial tenant.
