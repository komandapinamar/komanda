module "database" {
  source = "../modules/postgresql"

  environment                    = "staging"
  project_name                   = "komanda-core"
  location                       = "brazilsouth"
  postgres_server_name           = var.postgres_server_name
  postgres_version               = "17"
  database_name                  = "komanda"
  administrator_login            = "komanda_migration"
  administrator_password         = var.administrator_password
  administrator_password_version = var.administrator_password_version

  sku_name                     = "B_Standard_B1ms"
  storage_mb                   = 32768
  backup_retention_days        = 7
  geo_redundant_backup_enabled = false
  high_availability_mode       = null
  primary_availability_zone    = var.primary_availability_zone

  vnet_address_space        = ["10.20.0.0/16"]
  database_subnet_prefixes  = ["10.20.1.0/24"]
  migration_subnet_prefixes = ["10.20.3.0/24"]

  tags = {
    criticality = "preproduction"
  }
}
