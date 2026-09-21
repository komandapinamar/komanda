# KOMANDA CORE

## Target Architecture

This repository owns Komanda's operational product: `app.komanda.com`, tenant
storefronts, business administration, catalog, authentication, tenant provisioning,
orders, payments, printing, and authoritative multi-tenant data.

The public acquisition site lives in the separate `komanda-business` repository. It
consumes versioned Core contracts and never accesses this database directly. Future
Expo or other mobile clients consume those same contracts rather than depend on
Next.js pages or Server Actions.

## Current Runtime

Core is the operational source of truth. Storefronts, catalog, authentication,
payments, orders and printing use tenant-scoped PostgreSQL APIs. The former Strapi,
global-admin, global-payment and global-print paths are not part of the runtime.

link a figma: <https://www.figma.com/design/FOgLkQeRY7oDcvaONt6H5A/komanda?node-id=17-48&t=KNZSgvzYHZo4vrVB-1>

## Database

Database infrastructure is declared with OpenTofu under
[`../infra/database`](../infra/database/gcp/RUNBOOK.md). GCP Cloud SQL PostgreSQL
serves staging and production. The non-owner runtime role is created separately with
`npm --prefix src run db:bootstrap-roles` and is verified without `BYPASSRLS`.

Never apply database infrastructure with local state or `-auto-approve` in
production. Follow the reviewed plan and remote-state workflow in the linked
runbook.

## Multi-Tenant Release

The release is clean-start rather than an in-place legacy backfill. Apply the complete
Drizzle chain to an empty environment, provision tenants through the versioned API,
and verify the runtime role and RLS before opening traffic. Migration `0015` refuses
to remove legacy tables if they contain rows.

Health checks are available at `/api/health` and report database, object storage,
Mercado Pago, outbox and printing independently. Rollback uses a Core-compatible
release or a forward fix; the legacy system is not a rollback target.

# MercadoPago API

Each tenant connects its seller account with OAuth. Payment sessions and signed
webhooks use the tenant integration and `KOMANDA_PUBLIC_BASE_URL`.

## Local Printing

`komanda-desktop` is the supported local agent for network ESC/POS printers. Pair it
from the Backoffice with a one-time four-digit code, configure enabled printer
profiles, and install the Windows or Arch Linux package. The agent keeps its token in
OS-protected storage, polls the durable Core print queue, and sends independent TCP
connections to printer port 9100. Telpo-integrated printers remain owned by the
Android client and are never discovered by the desktop agent.

# Data Modelling

The authoritative model is PostgreSQL. Every catalog, cart, payment, order and
printing record carries an explicit tenant boundary and is protected by RLS.

## Deployment Configuration

Core uses the environment examples in `src/.env.staging.example` and
`src/.env.production.example`. Apply migrations with `DATABASE_DIRECT_URL`, run
`npm --prefix src run db:verify-roles:test` with the runtime URL, then deploy the
application using `DATABASE_URL` as `komanda_runtime`. The runtime role must never
be the migration owner and must not have `BYPASSRLS`.

# Infrasture and use cases

This project is intended to be used in any part of the ticketing process: kitchen, app/client menu, in the storefronts.
For dashboard access we have a segregation of roles, so the user can only access the information that is needed for their role.
For the menu anyone can access it, but for the kitchen and dashboard, the user needs to be authenticated and have the correct role to access it.

## Local Media Storage

The catalog media flow uses S3-compatible storage. Start MinIO from this
repository before running the app:

```bash
docker compose up -d
npm --prefix src run dev
```

The compose setup creates `komanda-dev-media` and enables anonymous reads for
local previews. `src/.env.local` contains the matching `OBJECT_STORAGE_*`
configuration. Use a private bucket plus a CDN/public media origin in staging
and production, setting `OBJECT_STORAGE_PUBLIC_BASE_URL` accordingly.
