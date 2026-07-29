variable "project_name" {
  description = "Stable Neon project name. This root always appends -development."
  type        = string
  default     = "komanda-core"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,48}$", var.project_name))
    error_message = "project_name must use lowercase letters, numbers, and hyphens."
  }
}

variable "organization_id" {
  description = "Optional Neon organization id. Leave null for a personal project."
  type        = string
  default     = null
  nullable    = true
}

variable "region_id" {
  description = "Neon development region. Sao Paulo minimizes latency from Argentina."
  type        = string
  default     = "aws-sa-east-1"
}

variable "postgres_version" {
  description = "PostgreSQL major version; must match Azure staging and production."
  type        = number
  default     = 17

  validation {
    condition     = var.postgres_version == 17
    error_message = "The database compatibility matrix is pinned to PostgreSQL 17."
  }
}

variable "database_name" {
  description = "Application database created on the development branch."
  type        = string
  default     = "komanda"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{1,62}$", var.database_name))
    error_message = "database_name must be a valid lowercase PostgreSQL identifier."
  }
}

variable "min_compute_units" {
  description = "Minimum Neon development compute units."
  type        = number
  default     = 0.25
}

variable "max_compute_units" {
  description = "Maximum Neon development compute units."
  type        = number
  default     = 0.5
}

variable "history_retention_seconds" {
  description = "Development restore history retained by Neon."
  type        = number
  default     = 21600

  validation {
    condition     = var.history_retention_seconds == 21600
    error_message = "Neon development is pinned to the account limit of 21600 seconds (6 hours)."
  }
}

variable "allowed_ips" {
  description = "Optional development IP allowlist. Availability depends on the Neon plan."
  type        = list(string)
  default     = []
}

check "development_compute_range" {
  assert {
    condition = (
      var.min_compute_units >= 0.25 &&
      var.max_compute_units >= var.min_compute_units
    )
    error_message = "Compute units must start at 0.25 and max must be >= min."
  }
}
