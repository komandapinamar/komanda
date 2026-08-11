variable "project" {
  type = string
}

variable "bucket_name" {
  description = "Globally unique GCS bucket for OpenTofu state."
  type        = string
}

variable "location" {
  type    = string
  default = "SOUTHAMERICA-EAST1"
}