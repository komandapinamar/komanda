variable "project" {
  type = string
}

variable "domain" {
  description = "Storefront/email root domain owned in Cloud DNS."
  type        = string
  default     = "komanda.app"
}

variable "resend_verification" {
  description = "Resend domain verification TXT value provided by Resend."
  type        = string
  sensitive   = true
  default     = null
}