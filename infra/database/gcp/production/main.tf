module "database" {
  source = "../modules/postgresql"

  environment      = "production"
  project_name     = var.project_name
  project          = var.project
  region           = var.region
  instance_name    = var.instance_name
  database_version = "POSTGRES_17"
  database_name    = var.database_name

  migration_user     = "komanda_migration"
  migration_password = var.migration_password

  tier                           = var.tier
  edition                        = "ENTERPRISE"
  availability_type              = var.availability_type
  storage_gb                     = var.storage_gb
  backup_retention_days          = var.backup_retention_days
  point_in_time_recovery_enabled = true

  ipv4_enabled        = var.ipv4_enabled
  require_ssl         = true
  authorized_networks = var.authorized_networks
  private_network     = var.private_network
  deletion_protection = true

  labels = {
    criticality = "business-critical"
  }
}