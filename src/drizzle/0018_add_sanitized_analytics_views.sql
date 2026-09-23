-- 1. Rol de analítica
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komanda_analytics') THEN
    CREATE ROLE komanda_analytics NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO komanda_analytics;
--> statement-breakpoint

-- 2. Vistas Sanitizadas con Security Barrier
CREATE OR REPLACE VIEW public.v_analytics_tenants
WITH (security_barrier = true) AS
SELECT 
  id AS tenant_id,
  name,
  slug,
  status,
  preset,
  default_currency,
  default_timezone,
  created_at,
  activated_at,
  suspended_at
FROM public.tenants;
--> statement-breakpoint

CREATE OR REPLACE VIEW public.v_analytics_orders
WITH (security_barrier = true) AS
SELECT 
  id AS order_id,
  tenant_id,
  location_id,
  purchase_number,
  source,
  fulfillment_status,
  payment_status,
  tender,
  subtotal,
  discount_total,
  total,
  currency,
  created_at,
  approved_at,
  delivered_at
FROM public.orders;
--> statement-breakpoint

CREATE OR REPLACE VIEW public.v_analytics_order_items
WITH (security_barrier = true) AS
SELECT 
  id AS order_line_id,
  tenant_id,
  order_id,
  name AS item_name,
  quantity,
  unit_price,
  line_total,
  created_at
FROM public.order_lines;
--> statement-breakpoint

CREATE OR REPLACE VIEW public.v_analytics_tenant_activity
WITH (security_barrier = true) AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  t.status AS tenant_status,
  t.preset AS tenant_preset,
  EXISTS (
    SELECT 1 FROM public.cash_shifts cs 
    WHERE cs.tenant_id = t.id AND cs.status = 'open'
  ) AS has_open_cash_shift,
  (
    SELECT count(*)::int FROM public.print_agents pa 
    WHERE pa.tenant_id = t.id 
      AND pa.status = 'active' 
      AND pa.last_seen_at >= (NOW() - INTERVAL '15 minutes')
  ) AS active_printers_count,
  (
    SELECT count(*)::int FROM public.orders o 
    WHERE o.tenant_id = t.id 
      AND o.created_at >= date_trunc('day', NOW() AT TIME ZONE t.default_timezone)
  ) AS orders_today_count,
  (
    SELECT max(o.created_at) FROM public.orders o 
    WHERE o.tenant_id = t.id
  ) AS last_order_at
FROM public.tenants t;
--> statement-breakpoint

-- 3. Privilegios de Solo Lectura para komanda_analytics
GRANT SELECT ON public.v_analytics_tenants TO komanda_analytics;
--> statement-breakpoint
GRANT SELECT ON public.v_analytics_orders TO komanda_analytics;
--> statement-breakpoint
GRANT SELECT ON public.v_analytics_order_items TO komanda_analytics;
--> statement-breakpoint
GRANT SELECT ON public.v_analytics_tenant_activity TO komanda_analytics;
