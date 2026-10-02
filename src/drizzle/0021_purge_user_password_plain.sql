-- Komanda never stores retrievable credentials. The plaintext column was added
-- in 0001 and written by the member service, so every row that ever received a
-- member password exposes that password to anyone able to read the table, its
-- replicas or its backups.
--
-- Detection (run BEFORE this migration, it never prints the secret itself):
--   select id, email, status
--     from users
--    where password_plain is not null
--    order by created_at;
-- Keep that list out of version control: it is the rotation worklist for the
-- accounts whose credentials were exposed at rest.
--
-- This migration only erases the stored copies. Application code stops reading
-- and writing the column in the same release (see features/members), so the
-- column is left in place for one release cycle to keep a previous version
-- deployable during a rolling deploy. A follow-up migration drops it.
UPDATE users SET password_plain = NULL WHERE password_plain IS NOT NULL;
--> statement-breakpoint
COMMENT ON COLUMN users.password_plain IS
  'Deprecated. Komanda never stores retrievable credentials; this column is purged and no longer written. Scheduled for removal.';
