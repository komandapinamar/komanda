output "project" {
  value = var.project
}

output "instance_name" {
  value = google_sql_database_instance.core.name
}

output "database_name" {
  value = google_sql_database.core.name
}

output "migration_role" {
  value = google_sql_user.migration.name
}

output "runtime_role" {
  value = "komanda_runtime"
}

output "public_ip_address" {
  value = google_sql_database_instance.core.public_ip_address
}

output "private_ip_address" {
  value = google_sql_database_instance.core.private_ip_address
}

output "server_fqdn" {
  value = coalesce(
    google_sql_database_instance.core.public_ip_address,
    google_sql_database_instance.core.private_ip_address,
    "known-after-apply",
  )
}

output "migration_connection_template" {
  value = "postgresql://${var.migration_user}:PASSWORD@${coalesce(google_sql_database_instance.core.public_ip_address, google_sql_database_instance.core.private_ip_address)}:5432/${var.database_name}?sslmode=require"
}

output "runtime_connection_template" {
  value = "postgresql://komanda_runtime:PASSWORD@${coalesce(google_sql_database_instance.core.public_ip_address, google_sql_database_instance.core.private_ip_address)}:5432/${var.database_name}?sslmode=require"
}