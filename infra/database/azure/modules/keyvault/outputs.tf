output "keyvault_id" {
  value = azurerm_key_vault.core.id
}

output "keyvault_uri" {
  value = azurerm_key_vault.core.vault_uri
}

output "keyvault_name" {
  value = azurerm_key_vault.core.name
}
