variable "environment" {
  type = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "project_name" {
  type    = string
  default = "komanda-core"
}

variable "project" {
  description = "GCP project id where the Cloud SQL instance is provisioned."
  type        = string
}

variable "region" {
  type    = string
  default = "southamerica-east1"
}

variable "instance_name" {
  description = "Globally unique Cloud SQL instance name."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,61}$", var.instance_name))
    error_message = "instance_name must contain 2-62 lowercase letters, numbers, or hyphens."
  }
}

variable "database_version" {
  type = string

  validation {
    condition     = var.database_version == "POSTGRES_17"
    error_message = "The compatibility matrix is pinned to PostgreSQL 17."
  }
}

variable "database_name" {
  type    = string
  default = "komanda"
}

variable "migration_user" {
  type    = string
  default = "komanda_migration"
}

variable "migration_password" {
  description = "Cloud SQL built-in password for the migration role. Supply through TF_VAR_migration_password."
  type        = string
  sensitive   = true
  ephemeral   = true

  validation {
    condition     = length(var.migration_password) >= 20
    error_message = "migration_password must contain at least 20 characters."
  }
}

variable "tier" {
  description = "Cloud SQL machine tier, for example db-f1-micro or db-g1-small."
  type        = string
}

variable "edition" {
  description = "Cloud SQL edition. Shared-core tiers require ENTERPRISE."
  type        = string
  default     = "ENTERPRISE"

  validation {
    condition     = contains(["ENTERPRISE", "ENTERPRISE_PLUS"], var.edition)
    error_message = "edition must be ENTERPRISE or ENTERPRISE_PLUS."
  }
}

variable "availability_type" {
  description = "ZONAL or REGIONAL. REGIONAL enables HA and double-compute cost."
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.availability_type)
    error_message = "availability_type must be ZONAL or REGIONAL."
  }
}

variable "storage_gb" {
  type    = number
  default = 32
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "point_in_time_recovery_enabled" {
  type    = bool
  default = true
}

variable "ipv4_enabled" {
  description = "Expose a public IPv4 address. Production targets private connectivity before opening traffic."
  type        = bool
  default     = true
}

variable "require_ssl" {
  type    = bool
  default = true
}

variable "authorized_networks" {
  description = "Nets allowed on the public listener. Empty list keeps the instance closed."
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "private_network" {
  description = "Self link of a VPC network for private connectivity, or empty."
  type        = string
  default     = ""
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "labels" {
  type    = map(string)
  default = {}
}

check "production_controls" {
  assert {
    condition = (
      var.environment != "production" ||
      (
        var.backup_retention_days >= 14 &&
        var.point_in_time_recovery_enabled &&
        var.deletion_protection
      )
    )
    error_message = "Production requires at least 14 backup days, PITR, and deletion protection enabled."
  }
}

check "shared_core_sla_caveat" {
  assert {
    condition = (
      var.tier != "db-f1-micro" &&
      var.tier != "db-g1-small"
    ) || var.environment != "production"
    error_message = "Shared-core tiers are not covered by the Cloud SQL SLA. Production uses them only during the low-traffic migration window."
  }
}