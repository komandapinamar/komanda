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

variable "resource_group_name" {
  description = "Name of the existing resource group (shared with database)."
  type        = string
}

variable "tenant_id" {
  description = "Microsoft Entra tenant ID for Key Vault."
  type        = string
}

variable "keyvault_name" {
  description = "Explicit Key Vault name (3-24 chars, alphanumeric and dashes). Must be globally unique."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
