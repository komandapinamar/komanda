output "resource_group_name" {
  value = azurerm_resource_group.database.name
}

output "server_id" {
  value = azurerm_postgresql_flexible_server.core.id
}

output "server_fqdn" {
  value = azurerm_postgresql_flexible_server.core.fqdn
}

output "database_name" {
  value = azurerm_postgresql_flexible_server_database.core.name
}

output "migration_role" {
  value = var.administrator_login
}

output "runtime_role" {
  value = "komanda_runtime"
}

output "migration_connection_template" {
  value = "postgresql://${var.administrator_login}:PASSWORD@${azurerm_postgresql_flexible_server.core.fqdn}:5432/${azurerm_postgresql_flexible_server_database.core.name}?sslmode=require"
}

output "runtime_connection_template" {
  value = "postgresql://komanda_runtime:PASSWORD@${azurerm_postgresql_flexible_server.core.fqdn}:5432/${azurerm_postgresql_flexible_server_database.core.name}?sslmode=require"
}

output "postgresql_subnet_id" {
  value = azurerm_subnet.postgresql.id
}
