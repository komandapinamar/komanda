# Komanda database infrastructure

Komanda uses the same PostgreSQL 17 schema and migrations in every environment,
but each environment has an explicit provider and isolated OpenTofu state.

| Environment | Database | Data policy | Production evidence |
|---|---|---|---|
| local / CI | ephemeral PostgreSQL 17 | synthetic fixtures | no |
| development | Neon in `aws-sa-east-1` | synthetic or approved irreversible anonymization only | no |
| staging | Cloud SQL for PostgreSQL (GCP) | synthetic/anonymized acceptance data | yes |
| production | Cloud SQL for PostgreSQL (GCP) | live business data | destination |

The roots are intentionally separate:

```text
infra/database/
├── neon/       # hard-coded development; cannot accept staging/production
├── azure/      # legacy Azure PostgreSQL roots, frozen during the GCP cutover
└── gcp/
    ├── modules/postgresql/  # shared Cloud SQL implementation
    ├── staging/             # environment and state key fixed
    └── production/          # environment and state key fixed
```

Every tenant in an environment shares one PostgreSQL schema and is isolated by
tenant-qualified constraints, application authorization and forced RLS. There
is no database per tenant.

## Remote state

All roots use the provider's remote state backend, but each has a different
key. The GCP roots use the GCS backend in `infra/state/gcp`:

- `komanda/database/neon/development.tfstate` (Azure Blob, legacy)
- `komanda/database/azure/staging.tfstate` (Azure Blob, legacy)
- `komanda/database/azure/production.tfstate` (Azure Blob, legacy)
- `komanda/database/gcp/staging.tfstate` (GCS)
- `komanda/database/gcp/production.tfstate` (GCS)

Provision the state bucket with `infra/state/gcp` before initializing a GCP
root. The examples use `komanda-tfstate`; verify that name is globally unique
in the intended project or replace it consistently.

## Neon development

```bash
cd infra/database/neon
cp backend.hcl.example backend.hcl
cp environments/development.tfvars.example development.tfvars
export NEON_API_KEY='...'

tofu init -backend-config=backend.hcl
tofu fmt -check -recursive
tofu validate
tofu plan -var-file=development.tfvars -out=development.tfplan
tofu show development.tfplan
tofu apply development.tfplan
```

This root has no environment variable and always creates
`komanda-core-development`. Never load a production backup, credential or
identifiable record into Neon.

## Azure staging

Azure PostgreSQL is private. The workload that runs role bootstrap and
migrations must have network access to the environment VNet.

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
```

Replace the placeholder subscription UUID and globally unique PostgreSQL server
name in the copied tfvars before planning.

The administrator password is ephemeral and is passed to the provider's
write-only field. Supply the same environment variable again when applying a
saved plan. Store the actual value in the deployment secret manager, never in
HCL, tfvars, outputs or logs.

After provisioning, run from the private migration path using the checked-in
staging environment template and database preparation script:

```bash
cd ../../../../src
cp .env.staging.example .env.staging
# Fill .env.staging from tofu output and the staging secret manager.
set -a
. ./.env.staging
set +a
npm run env:verify
npm run db:prepare:azure
```

Staging must pass migration, runtime-role/RLS, E2E, load and restore checks
before a production plan is approved.

See [azure/RUNBOOK.md](azure/RUNBOOK.md) for the full staging smoke flow:
owner verification, catalog writes, Mercado Pago OAuth and tenant activation.

## Azure production

Use a clean working directory or reinitialize the backend explicitly; never
reuse staging state:

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

Replace the placeholder subscription UUID and globally unique PostgreSQL server
name in the copied tfvars before planning.

Production checks require a non-burstable SKU, at least 14 days of backups and
HA. The example uses `SameZone` because zone-redundant capacity in Brazil South
must be confirmed when provisioning. Promote to `ZoneRedundant` only after an
explicit capacity check and reviewed plan.

After production provisioning, repeat the same private migration-path command
with `src/.env.production.example` filled from production outputs and set:

```bash
export CONFIRM_PRODUCTION_DATABASE_PREPARE=I_UNDERSTAND_THIS_TOUCHES_PRODUCTION
npm run env:verify
npm run db:prepare:azure
```

## GCP state bootstrap

Provision the GCS state bucket once per project before applying any GCP root:

```bash
cd infra/state/gcp
cp bootstrap.tfvars.example bootstrap.tfvars
# Fill project and a globally unique bucket_name.
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'

tofu init -backend=false
tofu plan -var-file=bootstrap.tfvars -out=bootstrap.tfplan
tofu apply bootstrap.tfplan
```

Then copy the matching `backend.hcl.example` and `*.tfvars.example` into the
GCP database root before planning.

## GCP staging and production

Cloud SQL for PostgreSQL uses the same migration, role and RLS verification
path with `DATABASE_PROVIDER=gcp`:

```bash
cd infra/database/gcp/staging   # or production
cp backend.hcl.example backend.hcl
cp staging.tfvars.example staging.tfvars
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

After provisioning, run the private migration path (or the add-on for the app
VPS egress) from `src`:

```bash
cd ../../../../src
cp .env.staging.example .env.staging
# Fill .env.staging from tofu output and the deployment secret manager.
set -a
. ./.env.staging
set +a
npm run env:verify
npm run db:prepare:gcp
```

Production repeats the same sequence with `infra/database/gcp/production`,
`src/.env.production.example`, and:

```bash
export CONFIRM_PRODUCTION_DATABASE_PREPARE=I_UNDERSTAND_THIS_TOUCHES_PRODUCTION
npm run env:verify
npm run db:prepare:gcp
```

GCP specifics:

- `db-f1-micro` / `db-g1-small` are shared-core tiers without a Cloud SQL SLA.
  They are acceptable for the low-traffic migration window but must be promoted
  to a dedicated `db-custom-*` tier before production traffic is opened.
- Production requires at least 14 days of backups, PITR, and deletion
  protection. The module enforces this with a `check` block.
- Public IPv4 is enabled in the examples for the app VPS. Prefer private IP +
  Cloud SQL Auth Proxy before production is opened, mirroring the old Azure
  private posture.

## Security boundaries

- `komanda_migration` owns the database and is used only by reviewed migration jobs.
- `komanda_runtime` is created by SQL with `NOSUPERUSER NOBYPASSRLS` and never owns tables.
- Azure PostgreSQL has public network access disabled.
- GCP Cloud SQL requires SSL (`ENCRYPTED_ONLY`) and targets private connectivity before production is opened.
- Azure staging and production use different resource groups, VNets, credentials and state keys.
- GCP staging and production use different instances, VPCs when private, credentials and state keys.
- Applied database resources use `prevent_destroy`; destructive replacement requires a reviewed code change.
- Never use `-auto-approve` for staging or production.
