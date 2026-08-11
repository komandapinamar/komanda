# KOMANDA CORE

## Target Architecture

This repository owns Komanda's operational product: `app.komanda.com`, tenant
storefronts, business administration, catalog, authentication, tenant provisioning,
orders, payments, printing, and authoritative multi-tenant data.

The public acquisition site lives in the separate `komanda-business` repository. It
consumes versioned Core contracts and never accesses this database directly. Future
Expo or other mobile clients consume those same contracts rather than depend on
Next.js pages or Server Actions.

See [the project constitution](.specify/memory/constitution.md) for repository
ownership, fault-containment, tenant-isolation, performance, and delivery rules.

## Current Runtime

Core is the operational source of truth. Storefronts, catalog, authentication,
payments, orders and printing use tenant-scoped PostgreSQL APIs. The former Strapi,
global-admin, global-payment and global-print paths are not part of the runtime.

link a figma: <https://www.figma.com/design/FOgLkQeRY7oDcvaONt6H5A/komanda?node-id=17-48&t=KNZSgvzYHZo4vrVB-1>

# Specs

 1. SPEC-001 Multi-tenant base.
 2. SPEC-002 Auth y roles.
 3. SPEC-003 Catálogo en Postgres.
 4. SPEC-004 Órdenes persistentes.
 5. SPEC-005 Payment abstraction.
 6. SPEC-006 Admin de catálogo.
 7. SPEC-007 Importador Excel/CSV.
 8. SPEC-008 MercadoPago multi-tenant.
 9. SPEC-009 Print queue robusta.
10. SPEC-010 Panel de pedidos.
11. SPEC-012 Módulo de mesas.
12. SPEC-011 Apple Pay.
13. SPEC-014 App de impresión.
14. SPEC-013 Home builder.
15. SPEC-015 OpenTofu.
16. SPEC-016 Observabilidad.
17. SPEC-017 Analytics.
18. SPEC-018 Integraciones.
19. SPEC-019 Retiro del legado operativo.

## Database

Database infrastructure is declared with OpenTofu under
[`infra/database`](infra/database/README.md). Neon is restricted to synthetic
development; independent Azure PostgreSQL instances serve staging and
production. The non-owner runtime role is created separately with
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

Using Neon + Drizzle inside chikenstop-nextjs

- Table schema in /db/schema.ts
- To push schema in the neon table should run

```bash
npm run db:push
```

(this is in case there are changes in temporary_carts table)

- Environment variable: CART_TTL_MINUTES to indicate the time of the cart living in the database.
  - in times of a lot of usage may want to reduce it to a few minutes
- For persistence in the navigatos it's not using the DB but saves it in localStorage

# MercadoPago API

Each tenant connects its seller account with OAuth. Payment sessions and signed
webhooks use the tenant integration and `KOMANDA_PUBLIC_BASE_URL`.

## Print Service

- The worker uses a tenant/location-scoped `PRINT_AGENT_TOKEN` issued by Core.
- Setup (in Raspberry PI system or running nonstop in a PC):

```bash
./print-service/setup_conda_env.sh
```

- Run:

```bash
./print-service/run_worker.sh
```

### Raspberry Pi

The recommended way is to set the printer worker in a Raspberry Pi (Raspberry Pi OS lite) is using a systemd service running when the system powers on.

First run ./print-service/setup_raspberry_print_service.sh to install dependencies and set up Conda environment.

Wifi should be set up in advance using raspi-config or nmtui, this is really important to have the raspi working autonomously.

Example Unit file in /etc/systemd/system/print-service.servic:

```
[Unit]
Description=Print Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/print-service
ExecStart=/home/pi/komanda/print-service/run_worker.sh
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

sudo systemctl daemon-reload
sudo systemctl enable print-service.service
sudo systemctl start print-service.service
sudo systemctl status print-service.service

# Data Modelling

The authoritative model is PostgreSQL. Every catalog, cart, payment, order and
printing record carries an explicit tenant boundary and is protected by RLS.

---

# VPS Configuration
>
>[!NOTE]
>This system was tested used with dokploy. For now, migrations and configurations will be centered around this tool.

### Migrating Dokploy to a different VPS

Transfer the entire filesystem using rsync:

```bash
rsync -aAXv --delete \ --exclude={"/dev/*","/proc/*","/sys/*","/tmp/*","/run/*","/mnt/*","/media/*","/lost+found","/swapfile"} \ -e "ssh -i /path/to/private_key" user@source_vps_ip:/ /
```

After the migration, update the server IP in the Dokploy database:

```sql
UPDATE admin SET "serverIp" = 'new_server_ip' WHERE "serverIp" = 'old_server_ip';
```

>[!IMPORTANT]
>Environment variables should be saved in advance for each service running inside dokploy.

## Deployment Configuration

Core uses the environment examples in `src/.env.staging.example` and
`src/.env.production.example`. Apply migrations with `DATABASE_DIRECT_URL`, run
`npm --prefix src run db:verify-roles:test` with the runtime URL, then deploy the
application using `DATABASE_URL` as `komanda_runtime`. The runtime role must never
be the migration owner and must not have `BYPASSRLS`.

The database infrastructure and Azure staging gate are documented in
`infra/database/README.md` and `infra/database/azure/RUNBOOK.md`.

# Infrasture and use cases

This project is intended to be used in any part of the ticketing process: kitchen, app/client menu, in the storefronts.
For dashboard access we have a segregation of roles, so the user can only access the information that is needed for their role.
For the menu anyone can access it, but for the kitchen and dashboard, the user needs to be authenticated and have the correct role to access it.
