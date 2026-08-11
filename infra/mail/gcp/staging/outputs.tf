output "managed_zone_name" {
  value = google_dns_managed_zone.komanda.name
}

output "dns_name" {
  value = google_dns_managed_zone.komanda.dns_name
}

output "name_servers" {
  value = google_dns_managed_zone.komanda.name_servers
}