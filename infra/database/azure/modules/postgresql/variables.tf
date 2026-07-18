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

variable "location" {
  type    = string
  default = "brazilsouth"
}

variable "postgres_server_name" {
  type = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$", var.postgres_server_name))
    error_message = "postgres_server_name must contain 3-63 lowercase letters, numbers, or hyphens."
  }
}

variable "postgres_version" {
  type    = string
  default = "17"

  validation {
    condition     = var.postgres_version == "17"
    error_message = "The compatibility matrix is pinned to PostgreSQL 17."
  }
}

variable "database_name" {
  type    = string
  default = "komanda"
}

variable "administrator_login" {
  type    = string
  default = "komanda_migration"
}

variable "administrator_password" {
  type      = string
  sensitive = true
  ephemeral = true
}

variable "administrator_password_version" {
  type    = number
  default = 1
}

variable "sku_name" {
  type = string
}

variable "storage_mb" {
  type    = number
  default = 32768
}

variable "backup_retention_days" {
  type = number
}

variable "geo_redundant_backup_enabled" {
  type    = bool
  default = false
}

variable "high_availability_mode" {
  type     = string
  default  = null
  nullable = true

  validation {
    condition     = var.high_availability_mode == null || contains(["SameZone", "ZoneRedundant"], var.high_availability_mode)
    error_message = "high_availability_mode must be null, SameZone, or ZoneRedundant."
  }
}

variable "primary_availability_zone" {
  type     = string
  default  = null
  nullable = true
}

variable "standby_availability_zone" {
  type     = string
  default  = null
  nullable = true
}

variable "vnet_address_space" {
  type = list(string)
}

variable "database_subnet_prefixes" {
  type = list(string)
}

variable "migration_subnet_prefixes" {
  description = "Dedicated subnet for ephemeral private migration and restore jobs."
  type        = list(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}

check "production_controls" {
  assert {
    condition = (
      var.environment != "production" ||
      (
        var.high_availability_mode != null &&
        var.backup_retention_days >= 14 &&
        can(regex("^(GP|MO)_", var.sku_name))
      )
    )
    error_message = "Production requires HA, at least 14 backup days, and a General Purpose or Memory Optimized SKU."
  }
}

check "zone_redundancy" {
  assert {
    condition = (
      var.high_availability_mode != "ZoneRedundant" ||
      var.standby_availability_zone != null
    )
    error_message = "ZoneRedundant mode requires an explicit standby_availability_zone."
  }
}
