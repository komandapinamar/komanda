# Komanda Core Runtime

## Deployment Order

1. Apply reviewed SQL migrations with `DATABASE_DIRECT_URL`.
2. Bootstrap and verify `komanda_runtime` without `BYPASSRLS`.
3. Deploy Core with versioned APIs and health checks enabled.
4. Run producer contracts, tenant-isolation and database compatibility suites.
5. Run staging restore and load gates before production.

## Tenant Boundary

All operational routes use the versioned tenant-aware APIs. There is no initial-tenant
fallback, global admin credential, global payment token, or global print token.

## Health And Rollback

`/api/health` reports database, object storage, Mercado Pago, outbox and printing
separately. Mercado Pago outage blocks new online sessions only; printing outage
keeps jobs recoverable through leases; acquisition outage does not affect existing
tenants.

Rollback after Core writes begin must use a Core-compatible release or a forward fix
under maintenance; the legacy system is not a rollback target.
