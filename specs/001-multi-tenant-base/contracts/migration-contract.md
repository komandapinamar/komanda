# Migration and Cutover Contract

## Goal

Move the current single-business operational data and Strapi catalog into the shared Core model as one initial tenant, while every release remains observable and reversible until the new source accepts writes.

## Inputs

A versioned migration manifest supplies:

- initial tenant id, name, normalized slug, currency and timezone;
- initial `plan_id` and accepted Core plan version;
- primary location id/name;
- current owner username and verified destination email;
- Strapi base URL and read credential reference;
- object-storage target and media policy;
- explicit cutoff timestamps;
- expected source environments and schema versions.

Secrets are referenced by environment/secret manager key and never serialized into the manifest or reports.

## Run modes

### preflight

- Validate connections, source schema versions and destination emptiness/idempotency.
- Count every source entity.
- Detect orphan carts/payments/orders/print jobs and invalid Strapi relationships.
- Fetch media metadata without writing.
- Produce report; exit non-zero on blocking errors.

### import

- Create/reuse the initial tenant, location, owner membership and entitlement snapshot.
- Seed/reuse the accepted plan definition from a reviewed Core migration; the manifest cannot define entitlement content.
- Backfill operational rows in stable ordered batches.
- Import catalog relations before dependent joins.
- Copy media and verify checksums.
- Record one `migration_records` row per source entity.
- Safe to repeat: identical checksum returns `skipped`; changed source is reported for delta handling.

### reconcile

- Compare source and target counts by entity and status.
- Compare deterministic checksums of business-relevant fields.
- Verify all tenant ids, composite relationships and required media.
- Run domain invariants and the two-tenant denial suite.
- Mark `cutover_ready` only with zero unaccepted blockers.

### cutover

- Require a reconciled run id.
- Freeze writes in Strapi and legacy catalog administration.
- Import the final delta and reconcile again.
- Switch reads to Core and execute smoke tests.
- Reopen writes only after smoke tests pass.

### rollback

- Before Core catalog writes reopen: restore the legacy read flag and application release; imported Core rows remain for inspection.
- After Core writes reopen: do not return Strapi to source-of-truth. Roll back application code only to a schema-compatible release that still reads Core, or place affected writes in maintenance while applying a forward fix.
- Every rollback records reason, actor, timestamps and affected release.

## Entity order

1. tenant;
2. entitlement snapshot;
3. primary location;
4. user and owner membership;
5. tenant settings and initial integration/print configuration;
6. media assets;
7. categories;
8. items;
9. combos and combo items;
10. carts and cart lines;
11. payment attempts and provider routes;
12. orders and immutable order lines;
13. print agents, jobs and attempts;
14. audit/migration completion event.

Additional groups/options have no Strapi source and begin empty unless supplied by a separate import file.

## Reconciliation report

The command emits JSON and Markdown with:

```text
runId
sourceSnapshotAt
targetTenantId
phase
entity:
  sourceCount
  importedCount
  skippedCount
  failedCount
  sourceChecksum
  targetChecksum
blockingErrors[]
warnings[]
startedAt
finishedAt
```

## Blocking conditions

- source entity without determinable target tenant;
- duplicate normalized tenant slug or owner email;
- unknown/inactive initial `plan_id` or entitlement snapshot mismatch;
- cart/payment/order chain that points to different tenants;
- approved payment without reconstructable order/cart;
- order without reconstructable immutable lines;
- print job without order and location;
- Strapi combo referencing a missing item;
- active item/combo with invalid price or category;
- required image missing or checksum mismatch;
- any source/target count or checksum difference not listed in an approved exception file;
- initial tenant without completed Mercado Pago OAuth when payment cutover is requested;
- failure in cross-tenant denial or regression suite.

## Database rollout sequence

1. Add new platform/catalog tables and runtime/migration roles.
2. Add nullable `tenant_id`, `location_id` and replacement references to populated legacy tables.
3. Deploy compatibility code that writes the explicit initial tenant.
4. Backfill in bounded batches with progress checkpoints.
5. Create tenant-first indexes, using concurrent creation where supported.
6. Add composite foreign keys as `NOT VALID`.
7. Reconcile and repair.
8. `VALIDATE CONSTRAINT`.
9. Apply `NOT NULL`, RLS policies and runtime grants.
10. Switch versioned contracts and catalog source.
11. After the compatibility window, remove legacy columns, routes, Strapi code/config and global credentials.

No destructive migration is combined with the release that introduces its replacement.

## Exit gates

### Gate A — expansion safe

- old application release still runs against expanded schema;
- new migrations have rollback/forward-fix notes;
- no table rewrite exceeds the approved maintenance budget.

### Gate B — backfill complete

- all operational rows have tenant and location where required;
- counts/checksums match;
- runtime role cannot bypass RLS.

### Gate C — catalog cutover

- final Strapi delta is zero after freeze;
- all public catalog responses match approved snapshots;
- media availability is 100% for published records;
- checkout regression passes.

### Gate D — tenant registration

- two-tenant matrix passes for reads, writes, ids, jobs, webhooks and printing;
- Mercado Pago seller authorization is tenant-specific;
- the initial tenant has completed OAuth and no migrated/manual provider token is active;
- the three initial entitlement flags are enforced with default denial;
- print agent scope is tenant/location-specific;
- performance target passes with 100 tenants and 50 operators.

### Gate E — legacy retirement

- seven-day pilot passes;
- no Strapi operational traffic;
- legacy route telemetry is zero for the agreed retirement period;
- initial tenant owner confirms catalog, orders, payments and printing.

## Compatibility windows

- Legacy admin cookie and global admin user: accepted only until the owner migration/re-auth release.
- Unversioned cart/payment/order endpoints: adapters for the explicit initial tenant for one documented release window.
- Global print token: accepted only while the initial agent upgrades; claims remain limited to the initial tenant/location.
- Strapi reads: allowed only before catalog cutover; no writes after freeze.
- Global Mercado Pago token: remains only in the legacy pre-cutover release, is never imported into the multi-tenant model and must be retired after the initial tenant completes OAuth.
