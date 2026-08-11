terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    resend = {
      source  = "resendlabs/resend"
      version = "~> 2.1"
    }
  }
}

provider "azurerm" {
  features {}
}

provider "resend" {
  # API Key loaded from TF_VAR_resend_api_key in pipeline
}

variable "domain_name" {
  default = "app.komanda.com"
}

# Example logic to add domain to resend, capture the DNS tokens, and create them in Azure DNS
# Note: normally you use a module, but this illustrates the required records.
