output "environment" {
  value = "development"
}

output "project_id" {
  description = "Neon development project identifier."
  value       = neon_project.development.id
}

output "database_name" {
  value = neon_project.development.database_name
}

output "migration_role" {
  value = neon_project.development.database_user
}

output "runtime_role" {
  value = "komanda_runtime"
}

output "direct_host" {
  description = "Development direct host used by controlled migration jobs."
  value       = neon_project.development.database_host
}

output "pooled_host" {
  description = "Development pooled host used by application runtime."
  value       = neon_project.development.database_host_pooler
}

output "migration_connection_uri" {
  description = "Development owner connection URI. Keep it in the secret manager."
  value       = neon_project.development.connection_uri
  sensitive   = true
}

output "runtime_connection_template" {
  description = "Development template only. Replace PASSWORD from the secret manager."
  value       = "postgresql://komanda_runtime:PASSWORD@${neon_project.development.database_host_pooler}/${neon_project.development.database_name}?sslmode=require&channel_binding=require"
}
