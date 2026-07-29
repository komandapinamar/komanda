locals {
  base_name = "${var.project_name}-${var.environment}"
  common_tags = merge(
    {
      application = "komanda"
      component   = "secrets"
      environment = var.environment
      managed_by  = "opentofu"
    },
    var.tags,
  )
}

resource "azurerm_key_vault" "core" {
  name                       = var.keyvault_name
  location                   = var.location
  resource_group_name        = var.resource_group_name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 90
  purge_protection_enabled   = true
  enabled_for_deployment     = false
  rbac_authorization_enabled = true

  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = local.common_tags
}

data "azurerm_client_config" "current" {}

resource "azurerm_role_assignment" "current_user_keyvault_admin" {
  scope                = azurerm_key_vault.core.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id
}
