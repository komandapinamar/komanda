-- Tenant erasure must be able to remove audit_events, but audit_events must stay
-- append-only for every other code path. The trigger therefore only rejects a
-- DELETE when the transaction has not explicitly opted in via app.allow_audit_purge.
CREATE OR REPLACE FUNCTION reject_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND nullif(current_setting('app.allow_audit_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only; updates and deletes are forbidden';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
