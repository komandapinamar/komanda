resource "google_storage_bucket" "state" {
  name                        = var.bucket_name
  project                     = var.project
  location                    = var.location
  uniform_bucket_level_access = true
  versioning {
    enabled = true
  }
  soft_delete_policy {
    retention_duration_seconds = 86400 * 30
  }
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age                = 90
      num_newer_versions = 0
    }
  }
}

resource "google_project_service" "storage" {
  project = var.project
  service = "storage-api.googleapis.com"

  disable_dependent_services = false
  disable_on_destroy         = false
}