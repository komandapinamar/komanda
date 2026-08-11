# Komanda Mail Infrastructure (Resend)

This provisions DNS records in Cloud DNS to verify domain identity for Resend.
The legacy Azure DNS example under `infra/mail/azure` is frozen; the GCP zone
is the target for the cutover.

## Provision

```bash
cd infra/mail/gcp/staging
cp mail.tfvars.example mail.tfvars
# Fill project, domain, and optionally resend_verification.
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account.json'

tofu init -reconfigure -backend-config=backend.hcl
tofu fmt -check -recursive
tofu validate
tofu plan -var-file=mail.tfvars -out=mail.tfplan
tofu apply mail.tfplan
```

Point the domain nameservers at the `name_servers` output only after the
database migration is verified. DNS is the last cutover step because it directly
affects email delivery.