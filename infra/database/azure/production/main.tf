module "database" {
  source = "../modules/postgresql"

  environment                    = "production"
  project_name                   = "komanda-core"
  location                       = "brazilsouth"
  postgres_server_name           = var.postgres_server_name
  postgres_version               = "17"
  database_name                  = "komanda"
  administrator_login            = "komanda_migration"
  administrator_password         = var.administrator_password
  administrator_password_version = var.administrator_password_version

  sku_name                     = "GP_Standard_D2s_v3"
  storage_mb                   = 32768
  backup_retention_days        = 14
  geo_redundant_backup_enabled = false

  # Brazil South zone-redundant capacity must be confirmed before promotion.
  high_availability_mode    = "SameZone"
  primary_availability_zone = "1"

  vnet_address_space       = ["10.30.0.0/16"]
  database_subnet_prefixes = ["10.30.1.0/24"]

  tags = {
    criticality = "business-critical"
  }
}
