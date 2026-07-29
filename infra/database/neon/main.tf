locals {
  environment  = "development"
  project_name = "${var.project_name}-${local.environment}"
}

resource "neon_project" "development" {
  name                      = local.project_name
  org_id                    = var.organization_id
  region_id                 = var.region_id
  pg_version                = var.postgres_version
  history_retention_seconds = var.history_retention_seconds
  store_password            = "yes"
  allowed_ips               = length(var.allowed_ips) == 0 ? null : var.allowed_ips

  branch {
    name          = local.environment
    database_name = var.database_name
    role_name     = "komanda_migration"
  }

  default_endpoint_settings {
    autoscaling_limit_min_cu = var.min_compute_units
    autoscaling_limit_max_cu = var.max_compute_units
  }

  lifecycle {
    prevent_destroy = true

    postcondition {
      condition = (
        self.database_host != "" &&
        self.database_host_pooler != ""
      )
      error_message = "Neon did not return both direct and pooled development hosts."
    }
  }
}

# This root has no environment input and cannot create staging or production.
# Neon contains synthetic development data only. The runtime role is created by
# the reviewed SQL bootstrap because Neon API roles inherit neon_superuser.
