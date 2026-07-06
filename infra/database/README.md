# Komanda database infrastructure

Komanda uses the same PostgreSQL 17 schema and migrations in every environment,
but each environment has an explicit provider and isolated OpenTofu state.

| Environment | Database | Data policy | Production evidence |
|---|---|---|---|
| local / CI | ephemeral PostgreSQL 17 | synthetic fixtures | no |
| development | Neon in `aws-sa-east-1` | synthetic or approved irreversible anonymization only | no |
| staging | Azure PostgreSQL Flexible Server | synthetic/anonymized acceptance data | yes |
| production | Azure PostgreSQL Flexible Server | live business data | destination |

The roots are intentionally separate:

```text
infra/database/
├── neon/       # hard-coded development; cannot accept staging/production
└── azure/
    ├── modules/postgresql/  # shared implementation
    ├── staging/             # environment and state key fixed
    └── production/          # environment and state key fixed
```

Every tenant in an environment shares one PostgreSQL schema and is isolated by
tenant-qualified constraints, application authorization and forced RLS. There
is no database per tenant.

## Remote state

All roots use the private Azure Blob backend in `komanda-infra-rg`, but each has
a different key:

- `komanda/database/neon/development.tfstate`
- `komanda/database/azure/staging.tfstate`
- `komanda/database/azure/production.tfstate`

The storage account/container must exist before `tofu init`. Enable blob
versioning, soft delete and Microsoft Entra access; do not use local state for
an applied environment. The examples use `komandatfstate9c4e27`; verify that
name exists in the intended subscription or replace it consistently.

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

After provisioning, run from the private migration path:

```bash
DATABASE_DIRECT_URL='...' DATABASE_RUNTIME_PASSWORD='...' \
  npm --prefix ../../../../src run db:bootstrap-roles
DATABASE_DIRECT_URL='...' npm --prefix ../../../../src run db:migrate
```

Staging must pass migration, runtime-role/RLS, E2E, load and restore checks
before a production plan is approved.

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

## Security boundaries

- `komanda_migration` owns the database and is used only by reviewed migration jobs.
- `komanda_runtime` is created by SQL with `NOSUPERUSER NOBYPASSRLS` and never owns tables.
- Azure PostgreSQL has public network access disabled.
- Azure staging and production use different resource groups, VNets, credentials and state keys.
- Applied database resources use `prevent_destroy`; destructive replacement requires a reviewed code change.
- Never use `-auto-approve` for staging or production.
