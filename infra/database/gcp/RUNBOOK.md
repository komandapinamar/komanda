# GCP database rollout runbook

This runbook provisions Cloud SQL for PostgreSQL staging first and then repeats
the shape for production with separate state, secrets and confirmation gates.
It replaces the legacy Azure PostgreSQL roots during the GCP cutover.

## Scope

The database environment supports the Core flows required for onboarding:

- owner verification through Core-issued challenges;
- tenant catalog and media writes;
- Mercado Pago OAuth credential storage per tenant;
- readiness and activation.

The app runtime still needs the matching application deployment, object storage,
Mercado Pago app and identity-delivery configuration. Migrations must run from a
workload with network access to the Cloud SQL instance (authorized public IP,
private IP, or Cloud SQL Auth Proxy).

## Prerequisites

- An active GCP account with `serviceusage` and the target services enabled.
- `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service account with
  `Cloud SQL Admin`, `Cloud SQL Editor`, `Storage Admin`, and `DNS Administrator`
  (role assignment depends on the running user).
- `infra/state/gcp` applied so the GCS state bucket exists.

## 1. Provision the state bucket

```bash
cd infra/state/gcp
cp bootstrap.tfvars.example bootstrap.tfvars
# Fill project and a globally unique bucket_name.
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'

tofu init -backend=false
tofu fmt -check -recursive
tofu validate
tofu plan -var-file=bootstrap.tfvars -out=bootstrap.tfplan
tofu show bootstrap.tfplan
tofu apply bootstrap.tfplan
```

Different GCP roots keep state under distinct prefixes:

- `komanda/database/gcp/staging.tfstate`
- `komanda/database/gcp/production.tfstate`
- `komanda/mail/gcp/staging.tfstate`

Never reuse a production state key for staging.

## 2. Provision staging infrastructure

```bash
cd infra/database/gcp/staging
cp backend.hcl.example backend.hcl
cp staging.tfvars.example staging.tfvars
# Replace project and instance_name in the copied tfvars.
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'
export TF_VAR_migration_password='generated-secret-from-secret-manager'

tofu init -reconfigure -backend-config=backend.hcl
tofu fmt -check -recursive
tofu validate
tofu plan -var-file=staging.tfvars -out=staging.tfplan
tofu show staging.tfplan
tofu apply staging.tfplan
tofu output -json
```

The password is passed to the provider write-only field. Keep the same
`TF_VAR_migration_password` when reapplying a saved plan. Store the actual value
in the deployment secret manager, never in HCL, tfvars, outputs or logs.

## 3. Prepare staging database

Run this from a path with network access to the instance. With a public IPv4
instance, add your client IP to `authorized_networks` in the tfvars and reapply
first; with a private IP, run from the app VPC or through Cloud SQL Auth Proxy.

```bash
cd src
cp .env.staging.example .env.staging
# Fill .env.staging from tofu output and the staging secret manager.
set -a
. ./.env.staging
set +a

npm ci
npm run env:verify
npm run db:prepare:gcp
```

`db:prepare:gcp` performs:

1. PostgreSQL URL validation and `DATABASE_EXPECTED_HOST` match.
2. `komanda_runtime` bootstrap/rotation with `NOBYPASSRLS`.
3. Drizzle migrations through `komanda_migration`.
4. runtime-vs-migration role verification.
5. forced-RLS verification for tenant-owned tables.

It writes a non-secret report to:

```text
artifacts/001-multi-tenant-base/staging-database-readiness.json
```

The Cloud SQL `komanda_migration` built-in user is created by infrastructure
apply. Database ownership and schema grants required by migration/restore jobs
must be confirmed once against the `postgres` admin connection and recorded in
the deployment evidence.

## 4. Configure staging application

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

## 5. Acceptance smoke flow

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

## 6. Production repetition

Production uses the same sequence with these intentional differences:

```bash
cd infra/database/gcp/production
cp backend.hcl.example backend.hcl
cp production.tfvars.example production.tfvars
# Replace project and instance_name in the copied tfvars.
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'
export TF_VAR_migration_password='generated-secret-from-secret-manager'

tofu init -reconfigure -backend-config=backend.hcl
tofu plan -var-file=production.tfvars -out=production.tfplan
tofu show production.tfplan
tofu apply production.tfplan
```

Then from the private/authorized production migration path:

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
npm run db:prepare:gcp
```

Production must not use capture delivery, mock tenants, local state, Neon data,
or staging credentials. Keep the staging readiness report attached to the
release approval before applying production.

## 7. Cutover notes

- DNS: move the Resend verification records to Cloud DNS
  (`infra/mail/gcp`) only after the database is verified end to end.
- Compute: `db-f1-micro` / `db-g1-small` shared-core tiers carry no Cloud SQL
  SLA. Promote to a dedicated `db-custom-*` instance and, before opening
  production traffic, move from public authorized IPs to private IP via Cloud
  SQL Auth Proxy or VPC peering.
- Legacy Azure roots are frozen. After the production cutover evidence is
  recorded, destroy the Azure PostgreSQL servers and Key Vault through their
  own root and remove the Azure Blob state keys.