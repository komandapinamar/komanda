ALTER TABLE "orders" DROP CONSTRAINT "orders_payment_status_check";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_check" CHECK ("payment_status" in ('pending', 'paid', 'failed', 'refunded', 'verification_required'));
