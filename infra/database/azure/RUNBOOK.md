# Azure database rollout runbook

This runbook prepares Azure PostgreSQL staging first and then repeats the same
shape for production with separate state, secrets and confirmation gates.

## Scope

The database environment supports the Core flows required for onboarding:

- owner verification through Core-issued challenges;
- tenant catalog and media writes;
- Mercado Pago OAuth credential storage per tenant;
- readiness and activation.

The app runtime still needs the matching application deployment, object storage,
Mercado Pago app and identity-delivery configuration. The database job must run
from a workload with private network access to the Azure PostgreSQL VNet.

## 1. Provision staging infrastructure

```bash
cd infra/database/azure/staging
cp backend.hcl.example backend.hcl
cp staging.tfvars.example staging.tfvars
az login
export TF_VAR_administrator_password='generated-secret-from-secret-manager'

tofu init -reconfigure -backend-config=backend.hcl
tofu fmt -check -recursive
tofu validate
tofu plan -var-file=staging.tfvars -out=staging.tfplan
tofu show staging.tfplan
tofu apply staging.tfplan
tofu output -json
```

Replace the subscription id and globally unique server name before planning.
Do not use local state for an applied staging environment.

## 2. Prepare staging database

Run this from the private migration path, not from a public laptop unless it has
approved private connectivity to the VNet.

```bash
cd src
cp .env.staging.example .env.staging
# Fill .env.staging from tofu output and the staging secret manager.
set -a
. ./.env.staging
set +a

npm ci
npm run env:verify
npm run db:prepare:azure
```

`db:prepare:azure` performs:

1. Azure PostgreSQL URL validation.
2. `komanda_runtime` bootstrap/rotation with `NOBYPASSRLS`.
3. Drizzle migrations through `komanda_migration`.
4. runtime-vs-migration role verification.
5. forced-RLS verification for tenant-owned tables.

It writes a non-secret report to:

```text
artifacts/001-multi-tenant-base/staging-database-readiness.json
```

## 3. Configure staging application

The same `.env.staging` values must be present in the Core app deployment,
except `DATABASE_DIRECT_URL` and `DATABASE_RUNTIME_PASSWORD` should be scoped to
deployment/migration jobs only.

Required external services:

- object storage bucket/container exposed through the S3-compatible env vars;
- Mercado Pago sandbox OAuth app with redirect URI:
  `/api/v1/integrations/mercadopago/oauth/callback`;
- Mercado Pago webhook secret and route configured in the provider;
- identity verification delivery:
  - staging may use `IDENTITY_VERIFICATION_DELIVERY=capture`;
  - production must use `IDENTITY_VERIFICATION_DELIVERY=http`.

## 4. Acceptance smoke flow

Use a staging-only business registration request through the public contract:

```bash
curl -X POST "$KOMANDA_PUBLIC_BASE_URL/api/v1/provisioning/tenants" \
  -H "Authorization: Bearer $KOMANDA_BUSINESS_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: staging-smoke-$(date +%s)" \
  -d '{
    "planId": "development",
    "owner": {
      "email": "owner.staging@example.test",
      "password": "Replace-with-a-real-test-password-2026!"
    },
    "tenant": {
      "name": "Staging Smoke",
      "slug": "staging-smoke",
      "currency": "ARS",
      "timezone": "America/Argentina/Buenos_Aires"
    },
    "primaryLocation": { "name": "Local principal" }
  }'
```

Expected:

- response status is `201`;
- owner verification is pending unless the owner already existed and was active;
- the response includes an onboarding handoff token;
- no sales are active yet.

For staging capture delivery, read the token from:

```text
src/.staging-artifacts/verification.jsonl
```

Then confirm the owner:

```bash
curl -X POST "$KOMANDA_PUBLIC_BASE_URL/api/v1/auth/email-verifications/confirm" \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_FROM_CAPTURE"}'
```

Consume the onboarding handoff in the browser/client, then validate:

- `/admin/[tenantId]/catalog` can create category/item/media;
- `/admin/[tenantId]/integrations` starts and completes Mercado Pago OAuth;
- `/admin/[tenantId]/onboarding` shows readiness complete after catalog and MP;
- `POST /api/v1/tenants/[tenantId]/activation` activates the storefront;
- `https://staging-smoke.staging.komanda.app/order` resolves the menu.

## 5. Production repetition

Production uses the same sequence with these intentional differences:

```bash
cd infra/database/azure/production
cp backend.hcl.example backend.hcl
cp production.tfvars.example production.tfvars
export TF_VAR_administrator_password='generated-secret-from-secret-manager'

tofu init -reconfigure -backend-config=backend.hcl
tofu plan -var-file=production.tfvars -out=production.tfplan
tofu show production.tfplan
tofu apply production.tfplan
```

Then from the private production migration path:

```bash
cd src
cp .env.production.example .env.production
# Fill .env.production from production outputs and secret manager.
set -a
. ./.env.production
set +a
export CONFIRM_PRODUCTION_DATABASE_PREPARE=I_UNDERSTAND_THIS_TOUCHES_PRODUCTION

npm ci
npm run env:verify
npm run db:prepare:azure
```

Production must not use capture delivery, mock tenants, local state, Neon data,
or staging credentials. Keep the staging readiness report attached to the
release approval before applying production.
