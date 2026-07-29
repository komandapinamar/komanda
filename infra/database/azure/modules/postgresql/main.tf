locals {
  base_name             = "${var.project_name}-${var.environment}"
  resource_group_name   = "${local.base_name}-rg"
  private_dns_zone_name = "${local.base_name}.postgres.database.azure.com"
  common_tags = merge(
    {
      application = "komanda"
      component   = "database"
      environment = var.environment
      managed_by  = "opentofu"
    },
    var.tags,
  )
}

resource "azurerm_resource_group" "database" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.common_tags
}

resource "azurerm_virtual_network" "database" {
  name                = "${local.base_name}-vnet"
  location            = azurerm_resource_group.database.location
  resource_group_name = azurerm_resource_group.database.name
  address_space       = var.vnet_address_space
  tags                = local.common_tags
}

resource "azurerm_subnet" "postgresql" {
  name                 = "postgresql"
  resource_group_name  = azurerm_resource_group.database.name
  virtual_network_name = azurerm_virtual_network.database.name
  address_prefixes     = var.database_subnet_prefixes
  service_endpoints    = ["Microsoft.Storage"]

  delegation {
    name = "postgresql-flexible-server"

    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

resource "azurerm_subnet" "migration_jobs" {
  name                 = "migration-jobs"
  resource_group_name  = azurerm_resource_group.database.name
  virtual_network_name = azurerm_virtual_network.database.name
  address_prefixes     = var.migration_subnet_prefixes
  service_endpoints    = ["Microsoft.Storage"]

  delegation {
    name = "container-instance-migration-jobs"

    service_delegation {
      name = "Microsoft.ContainerInstance/containerGroups"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/action",
      ]
    }
  }
}

resource "azurerm_private_dns_zone" "postgresql" {
  name                = local.private_dns_zone_name
  resource_group_name = azurerm_resource_group.database.name
  tags                = local.common_tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgresql" {
  name                  = "${local.base_name}-postgresql-link"
  private_dns_zone_name = azurerm_private_dns_zone.postgresql.name
  virtual_network_id    = azurerm_virtual_network.database.id
  resource_group_name   = azurerm_resource_group.database.name
  registration_enabled  = false
  tags                  = local.common_tags
}

resource "azurerm_postgresql_flexible_server" "core" {
  name                          = var.postgres_server_name
  resource_group_name           = azurerm_resource_group.database.name
  location                      = azurerm_resource_group.database.location
  version                       = var.postgres_version
  delegated_subnet_id           = azurerm_subnet.postgresql.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgresql.id
  public_network_access_enabled = false

  administrator_login               = var.administrator_login
  administrator_password_wo         = var.administrator_password
  administrator_password_wo_version = var.administrator_password_version

  sku_name                     = var.sku_name
  storage_mb                   = var.storage_mb
  storage_tier                 = "P4"
  auto_grow_enabled            = true
  backup_retention_days        = var.backup_retention_days
  geo_redundant_backup_enabled = var.geo_redundant_backup_enabled
  zone                         = var.primary_availability_zone

  authentication {
    active_directory_auth_enabled = false
    password_auth_enabled         = true
  }

  dynamic "high_availability" {
    for_each = var.high_availability_mode == null ? [] : [var.high_availability_mode]

    content {
      mode                      = high_availability.value
      standby_availability_zone = var.standby_availability_zone
    }
  }

  maintenance_window {
    day_of_week  = 0
    start_hour   = 6
    start_minute = 0
  }

  tags       = local.common_tags
  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgresql]

  lifecycle {
    prevent_destroy = true

    postcondition {
      condition     = self.public_network_access_enabled == false
      error_message = "Azure PostgreSQL must remain private."
    }
  }
}

resource "azurerm_postgresql_flexible_server_database" "core" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.core.id
  charset   = "UTF8"
  collation = "en_US.utf8"

  lifecycle {
    prevent_destroy = true
  }
}
