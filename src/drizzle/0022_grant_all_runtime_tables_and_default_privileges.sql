-- 1. Ensure komanda_runtime has permissions on all operational tables and sequences (including global_product_catalog)
GRANT USAGE ON SCHEMA public TO komanda_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO komanda_runtime;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO komanda_runtime;
--> statement-breakpoint

-- 2. Ensure komanda_migration has full maintenance access
GRANT ALL ON ALL TABLES IN SCHEMA public TO komanda_migration;
--> statement-breakpoint
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO komanda_migration;
--> statement-breakpoint

-- 3. Set default privileges so future tables and sequences automatically inherit permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO komanda_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO komanda_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO komanda_migration;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO komanda_migration;
