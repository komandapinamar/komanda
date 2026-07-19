variable "subscription_id" {
  type = string

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.subscription_id))
    error_message = "subscription_id must be an Azure subscription UUID."
  }
}

variable "postgres_server_name" {
  description = "Globally unique Azure PostgreSQL production server name."
  type        = string
}

variable "administrator_password" {
  description = "Supply through TF_VAR_administrator_password."
  type        = string
  sensitive   = true
  ephemeral   = true

  validation {
    condition     = length(var.administrator_password) >= 20
    error_message = "administrator_password must contain at least 20 characters."
  }
}

variable "tenant_id" {
  description = "Microsoft Entra tenant ID for Key Vault RBAC."
  type        = string
}

variable "administrator_password_version" {
  type    = number
  default = 1
}
