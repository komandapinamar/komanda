resource "google_dns_managed_zone" "komanda" {
  name     = "komanda-app"
  project  = var.project
  dns_name = "${var.domain}."
  labels = {
    application = "komanda"
    component   = "mail"
    environment = "staging"
    managed_by  = "opentofu"
  }
}

resource "google_dns_record_set" "resend_verification" {
  count = var.resend_verification != null ? 1 : 0

  name         = "${var.domain}."
  type         = "TXT"
  managed_zone = google_dns_managed_zone.komanda.name
  project      = var.project
  rrdatas      = [var.resend_verification]
  ttl          = 300
}