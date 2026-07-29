output "environment" {
  value = "staging"
}

output "resource_group_name" {
  value = module.database.resource_group_name
}

output "server_id" {
  value = module.database.server_id
}

output "server_fqdn" {
  value = module.database.server_fqdn
}

output "database_name" {
  value = module.database.database_name
}

output "migration_connection_template" {
  value = module.database.migration_connection_template
}

output "runtime_connection_template" {
  value = module.database.runtime_connection_template
}

output "postgresql_subnet_id" {
  value = module.database.postgresql_subnet_id
}

output "migration_subnet_id" {
  value = module.database.migration_subnet_id
}
