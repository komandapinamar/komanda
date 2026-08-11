locals {
  common_labels = merge(
    {
      application = "komanda"
      component   = "database"
      environment = var.environment
      managed_by  = "opentofu"
    },
    var.labels,
  )
}

resource "google_sql_database_instance" "core" {
  name                = var.instance_name
  project             = var.project
  region              = var.region
  database_version    = var.database_version
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.tier
    edition           = var.edition
    availability_type = var.availability_type
    disk_type         = "PD_SSD"
    disk_size         = var.storage_gb
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = var.ipv4_enabled
      ssl_mode        = var.require_ssl ? "ENCRYPTED_ONLY" : "ALLOW_UNENCRYPTED_AND_ENCRYPTED"
      private_network = var.private_network != "" ? var.private_network : null

      dynamic "authorized_networks" {
        for_each = var.ipv4_enabled ? var.authorized_networks : []
        content {
          name  = authorized_networks.value.name
          value = authorized_networks.value.value
        }
      }
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.point_in_time_recovery_enabled
      start_time                     = "03:00"
      transaction_log_retention_days = var.backup_retention_days
    }

    maintenance_window {
      day          = 7
      hour         = 6
      update_track = "stable"
    }
  }

  depends_on = [google_project_service.sqladmin]

  lifecycle {
    ignore_changes = [settings[0].database_flags]
  }
}

resource "google_project_service" "sqladmin" {
  project = var.project
  service = "sqladmin.googleapis.com"

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_sql_database" "core" {
  name     = var.database_name
  instance = google_sql_database_instance.core.name
  project  = var.project

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_sql_user" "migration" {
  name                = var.migration_user
  instance            = google_sql_database_instance.core.name
  project             = var.project
  password_wo         = var.migration_password
  password_wo_version = 1
}