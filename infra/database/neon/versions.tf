terraform {
  required_version = "~> 1.12.0"

  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = "= 0.13.0"
    }
  }

  backend "azurerm" {}
}

provider "neon" {
  # Read from NEON_API_KEY. Never place the API key in HCL or tfvars.
}
