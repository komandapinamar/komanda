-- Politicas de RLS para los servicios de plataforma (BL-2 del PRD de
-- resiliencia cloud native).
--
-- El dispatcher de la outbox y el escaner de conciliacion de pagos barren
-- trabajo de todos los tenants. El aislamiento por tenant los deja a ciegas:
-- sin una politica que reconozca el service_id, el worker corre, no reclama
-- nada y el backlog crece sin que nadie lo note. Esto ya afectaba al escaner
-- de conciliacion, que declaraba el service_id pero no existia politica que
-- lo respaldara.
--
-- El acceso es por service_id concreto, no "cualquier service_id": declarar un
-- servicio no le regala lectura cross-tenant al rol de runtime.

drop policy if exists outbox_events_platform_dispatch on outbox_events;
--> statement-breakpoint
create policy outbox_events_platform_dispatch
  on outbox_events
  for all
  to komanda_runtime
  using (
    nullif(current_setting('app.service_id', true), '')::text
      in ('outbox-dispatcher', 'outbox:metrics')
  )
  with check (
    nullif(current_setting('app.service_id', true), '')::text
      in ('outbox-dispatcher', 'outbox:metrics')
  );
--> statement-breakpoint

drop policy if exists payment_attempts_platform_reconciliation on payment_attempts;
--> statement-breakpoint
create policy payment_attempts_platform_reconciliation
  on payment_attempts
  for all
  to komanda_runtime
  using (
    nullif(current_setting('app.service_id', true), '')::text
      = 'payment:reconciliation-scanner'
  )
  with check (
    nullif(current_setting('app.service_id', true), '')::text
      = 'payment:reconciliation-scanner'
  );
