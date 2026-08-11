variable "project_name" {
  type    = string
  default = "komanda-core"
}

variable "project" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  type    = string
  default = "southamerica-east1"
}

variable "instance_name" {
  description = "Globally unique Cloud SQL instance name."
  type        = string
}

variable "database_name" {
  type    = string
  default = "komanda"
}

variable "migration_password" {
  description = "Cloud SQL built-in password for komanda_migration. Supply through TF_VAR_migration_password."
  type        = string
  sensitive   = true
  ephemeral   = true

  validation {
    condition     = length(var.migration_password) >= 20
    error_message = "migration_password must contain at least 20 characters."
  }
}

variable "tier" {
  type    = string
  default = "db-f1-micro"
}

variable "availability_type" {
  type    = string
  default = "ZONAL"
}

variable "storage_gb" {
  type    = number
  default = 32
}

variable "backup_retention_days" {
  type    = number
  default = 14
}

variable "ipv4_enabled" {
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
  type    = string
  default = ""
}