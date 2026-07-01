# KOMANDA SYSTEM

## Target Architecture

Komanda is evolving into two independently deployable product repositories:

- **Acquisition repository (Astro)**: `komanda.com`, commercial plans, public content,
  gastronomic-business registration experience, and acquisition analytics.
- **Core repository (this Next.js project)**: `app.komanda.com`, tenant storefronts,
  business administration, catalog, authentication, orders, payments, printing, and
  authoritative multi-tenant data.

The Acquisition repository owns the registration funnel, but it provisions accounts,
tenants, initial locations, and owner memberships through a versioned Core contract.
It must not access the Core database directly. Future Expo or other mobile clients
will consume the same versioned Core contracts rather than depend on Next.js pages or
Server Actions.

See [the project constitution](.specify/memory/constitution.md) for repository
ownership, fault-containment, tenant-isolation, performance, and delivery rules.

## Current Legacy State

- Menu changes made only from Strapi CRM
- Api route on $url + /api/menu to get updated menu from strapi
- Strapi running on port 1337 so it is allowed in "remotePatterns" in next.config.ts

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
19. SPEC-019 Migración final desde Strapi.

## Database

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

- it should be aware of my current URL, that's very important to get the confirmation of approved payments.

## Print Service

- `Next.js` only keeps `PRINT_SERVICE_TOKEN` in `chikenstop-nextjs/.env`.
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

# Data modelling

As per now, Sprapi v5 does not support polymorphic relations, so the way to model the entities was repetitve and dull at best, but it is what it is. The entities are:

- MenuItem:
  - name
  - price
  - description
  - image
  - category (relation to Category, many to one)
  - combos (relation to Combo, many to many)
  - active (optional), not used for now. The same for combos
- Combo:
  - name
  - price (The total price of the combo, not the sum of the items)
    - note: the discount will be given by discount = sumItemsPrice - combo.price
  - description
  - image
  - items (relation to MenuItem, many to many)
- Category:
  - name
  - menuItems (relation to MenuItem, one to many)
  - combos (relation to Combos, one to many)

---

# VPS Configuration
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

## Dokploy Setup
First create a service application for Nextjs and another for cms(Strapi). Then create a Posgres database service for Strapi content.
<img width="1566" height="718" alt="image" src="https://github.com/user-attachments/assets/d1a2f27e-510c-42d7-b360-056f50de0227" />
The cmsdb will provide an "Internal Connection URL" that will be used for connecting to Strapi application.

### Environment variables
#### Nextjs service application .env.example:
```txt
STRAPI_FULL_ACCESS_TOKEN=your_strapi_full_access_token_here
STRAPI_URL=https://your-strapi-instance.example.com

MP_PUBLIC_KEY=APP_USR-your_public_key_here

# only this to change in production
NEXT_PUBLIC_API_URL=https://your-production-domain.example.com

MP_ACCESS_TOKEN=APP_USR-your_access_token_here

MP_WEBHOOK_URL=https://your-production-domain.example.com/api/payments/webhook
MP_WEBHOOK_SECRET=your_mercadopago_webhook_secret_here

# keep Neon credentials secure: do not expose them to client-side code
# runtime/app traffic should use the Neon pooler
DATABASE_URL="postgresql://db_user:db_password@your-neon-pooler-host/database_name?sslmode=require&pgbouncer=true&connect_timeout=15"

# schema changes and migrations should use the direct connection
DATABASE_DIRECT_URL="postgresql://db_user:db_password@your-neon-direct-host/database_name?sslmode=require"

CRON_CART_CLEANUP_SECRET=your_cron_cleanup_secret_here

# this is the time to live for the cart in the database
# in minutes
CART_TTL_MINUTES=60

# token used to authenticate with the print service
PRINT_SERVICE_TOKEN=your_print_service_token_here

# JWT
ADMIN_JWT_SECRET=your_admin_jwt_secret_here

ADMIN_PASSWORD=change_this_to_a_strong_password
```
DATABASE_URL: main database connection for the app. Pooler connection. (NeonDB)

DATABASE_DIRECT_URL: direct database connection for migrations. (NeonDB)

CRON_CART_CLEANUP_SECRET: generated using ```openssl rand -hex 32

STRAPI_FULL_ACCESS_TOKEN: private token for full CMS access. Given in Strapi configuration.

ADMIN_JWT_SECRET: signs admin auth tokens. Generated using ```openssl rand -hex 32

ADMIN_PASSWORD: admin login password to access admin dashboard (with user admin), should be strong.

NEXT_PUBLIC_API_URL: public API URL used by the Nextjs frontend.

#### Cms (Strapi) service application .env.example:
See: https://docs.strapi.io/cms/configurations/environment
```txt
HOST=0.0.0.0
PORT=1337
APP_KEYS="toBeModified1,toBeModified2"
API_TOKEN_SALT=tobemodified
ADMIN_JWT_SECRET=tobemodified
TRANSFER_TOKEN_SALT=tobemodified
JWT_SECRET=tobemodified
ENCRYPTION_KEY=tobemodified

DATABASE_CLIENT=postgres /* given that we will be using postgres on dokploy */
DATABASE_URL=postgresql://strapi:123456789@hamburguesasdeautor-cmsdb-tbo2g7:5432/hamburguesasdeautor_cms /* Internal Connection URL in db service application */
DATABASE_SCHEMA=public
DATABASE_SSL=false
```

# todo

- build categories for the admin panel
- create aditionals free/paid
- create promo codes
- create dashbord (dbt connected to neon from checkout_payments table) with:
  - hourly sales
  - daily sales
