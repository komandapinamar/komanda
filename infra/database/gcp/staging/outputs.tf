output "environment" {
  value = "staging"
}

output "instance_name" {
  value = module.database.instance_name
}

output "database_name" {
  value = module.database.database_name
}

output "server_fqdn" {
  value = module.database.server_fqdn
}

output "public_ip_address" {
  value = module.database.public_ip_address
}

output "private_ip_address" {
  value = module.database.private_ip_address
}

output "migration_connection_template" {
  value = module.database.migration_connection_template
}

output "runtime_connection_template" {
  value = module.database.runtime_connection_template
}