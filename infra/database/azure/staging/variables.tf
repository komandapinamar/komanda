variable "subscription_id" {
  type = string

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.subscription_id))
    error_message = "subscription_id must be an Azure subscription UUID."
  }
}

variable "postgres_server_name" {
  description = "Globally unique Azure PostgreSQL staging server name."
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

variable "administrator_password_version" {
  type    = number
  default = 1
}

variable "primary_availability_zone" {
  description = "Availability zone Azure assigned to the staging server. Set this after importing an interrupted creation."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.primary_availability_zone == null || contains(["1", "2", "3"], var.primary_availability_zone)
    error_message = "primary_availability_zone must be null, 1, 2, or 3."
  }
}
