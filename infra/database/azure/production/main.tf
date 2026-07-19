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

  high_availability_mode    = "ZoneRedundant"
  primary_availability_zone = "1"
  standby_availability_zone = "2"

  vnet_address_space        = ["10.30.0.0/16"]
  database_subnet_prefixes  = ["10.30.1.0/24"]
  migration_subnet_prefixes = ["10.30.2.0/24"]

  tags = {
    criticality = "business-critical"
  }
}

module "keyvault" {
  source = "../modules/keyvault"

  environment         = "production"
  project_name        = "komanda-core"
  location            = "brazilsouth"
  keyvault_name       = "komanda-prod-kv-9c4e27"
  resource_group_name = module.database.resource_group_name
  tenant_id           = var.tenant_id

  tags = {
    criticality = "business-critical"
  }
}
