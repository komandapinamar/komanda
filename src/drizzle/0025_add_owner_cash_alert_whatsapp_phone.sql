ALTER TABLE "tenant_settings"
  ADD COLUMN "owner_cash_alert_whatsapp_phone" text;

ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_owner_cash_whatsapp_phone_check"
  CHECK ("owner_cash_alert_whatsapp_phone" IS NULL OR "owner_cash_alert_whatsapp_phone" ~ '^549[1-9][0-9]{9}$');
