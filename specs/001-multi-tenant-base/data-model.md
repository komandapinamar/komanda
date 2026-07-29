# Data Model: Plataforma multi-tenant autoservicio

**Date**: 2026-07-05
**Database**: PostgreSQL compartido; UUID como identificador interno; timestamps con zona horaria.

## Conventions and isolation rules

1. Toda tabla tenant-owned incluye `tenant_id UUID NOT NULL`.
2. Cada tabla tenant-owned declara `UNIQUE (tenant_id, id)` para habilitar foreign keys compuestas.
3. Toda relación entre dos registros tenant-owned usa `FOREIGN KEY (tenant_id, child_id) REFERENCES parent(tenant_id, id)`.
4. Los índices de listados comienzan con `tenant_id`, seguido por estado/orden y luego el cursor.
5. Todos los importes usan decimal fijo y código ISO de moneda; nunca punto flotante.
6. Registros que participan en historial se archivan con `archived_at`; no se borran físicamente desde flujos normales.
7. Las tablas tenant-owned usan RLS default-deny para el rol runtime. El rol de migraciones es separado.
8. Toda mutación editable incluye `version INTEGER` para control de concurrencia optimista.
9. PII y secretos nunca se copian a tablas de eventos; los eventos guardan identificadores y metadata sanitizada.

## Platform and identity

### plan_definitions

Catálogo operacional global de planes que Core acepta; no contiene contenido comercial o marketing.

| Field | Type | Rules |
|---|---|---|
| plan_id | text | identificador estable |
| version | integer | versión monotónica |
| status | enum | `active`, `inactive` |
| entitlements | jsonb | flags booleanos validados: `catalog_management`, `online_payments`, `printing` |
| effective_from | timestamptz | requerido |
| retired_at | timestamptz | nullable |
| created_at | timestamptz | requerido |

**PK**: `(plan_id, version)`. Una versión inactiva no puede usarse para nuevas altas, pero sus snapshots existentes siguen siendo interpretables.

Las filas se insertan o modifican únicamente mediante migraciones versionadas y revisables de Core. No existe escritura runtime desde `komanda-business` ni backoffice de planes en este alcance.

### tenants

Representa la frontera principal de datos y operación.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| name | text | requerido |
| slug | text | valor público original |
| normalized_slug | text | requerido, unique global |
| status | enum | `onboarding`, `active`, `suspended` |
| default_currency | char(3) | requerido, inicialmente `ARS` |
| default_timezone | text | requerido |
| version | integer | inicia en 1 |
| activated_at | timestamptz | nullable |
| suspended_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | requeridos |

**Validation**:

- `normalized_slug` se calcula en servidor y no se modifica implícitamente.
- `active` requiere readiness válida.
- No existe tenant por defecto en runtime.

### tenant_entitlement_snapshots

Snapshot inmutable resuelto por Core desde el `plan_id` enviado por `komanda-business`.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| plan_id / plan_version | text / integer | FK compuesta plan_definitions |
| entitlements | jsonb | copia validada e inmutable de los tres flags operacionales |
| source_request_id | text | idempotencia/trazabilidad del contrato |
| effective_at | timestamptz | requerido |
| superseded_at | timestamptz | nullable |
| created_at | timestamptz | requerido |

**Constraints**: unique `(tenant_id, id)`; un solo snapshot sin `superseded_at` por tenant. Cambiar de plan crea un snapshot nuevo y supersede el anterior, nunca lo modifica.

### tenant_locations

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK, unique con tenant |
| tenant_id | UUID | FK tenants |
| name | text | requerido |
| timezone | text | requerido |
| status | enum | `active`, `inactive` |
| is_primary | boolean | una sola sede primaria por tenant |
| address | jsonb | estructura validada, nullable |
| created_at / updated_at | timestamptz | requeridos |

### users

Identidad global; no contiene tenant activo.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| email | text | requerido |
| normalized_email | text | unique global |
| password_hash | text | requerido para credencial local |
| status | enum | `pending_verification`, `active`, `disabled` |
| email_verified_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | requeridos |

### user_sessions

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users |
| token_digest | text | unique; nunca se guarda token plano |
| expires_at | timestamptz | requerido |
| revoked_at | timestamptz | nullable |
| last_seen_at | timestamptz | requerido |
| metadata | jsonb | datos no sensibles de dispositivo |
| created_at | timestamptz | requerido |

### identity_verification_challenges

Desafíos de un solo uso administrados exclusivamente por Core; el token plano solo se entrega por el canal de verificación y nunca se persiste.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users |
| token_digest | text | unique; digest del token aleatorio |
| expires_at | timestamptz | requerido |
| consumed_at | timestamptz | nullable; consumo atómico de un solo uso |
| attempt_count | integer | >= 0, con límite configurado |
| created_at | timestamptz | requerido |

Solo un desafío vigente puede permanecer activo por usuario y propósito. Validarlo actualiza `users.email_verified_at` y `users.status` en la misma transacción.

### tenant_memberships

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| user_id | UUID | FK users |
| role | enum | `owner` en este alcance |
| status | enum | `active`, `revoked` |
| created_at / updated_at | timestamptz | requeridos |

**Constraints**: unique `(tenant_id, user_id)`; toda operación administrativa valida membresía activa.

### tenant_settings

Un registro por tenant.

| Field | Type | Rules |
|---|---|---|
| tenant_id | UUID | PK/FK tenants |
| contact_name | text | nullable |
| contact_email | text | nullable |
| contact_phone | text | nullable |
| sales_enabled | boolean | default false |
| printing_enabled | boolean | default false |
| order_prefix | text | requerido, validado |
| branding | jsonb | solo propiedades soportadas |
| version | integer | control optimista |
| updated_at | timestamptz | requerido |

### tenant_counters

Genera números visibles sin colisiones dentro de un tenant.

| Field | Type | Rules |
|---|---|---|
| tenant_id | UUID | FK tenants |
| counter_type | text | por ejemplo `purchase_number` |
| current_value | bigint | >= 0 |
| updated_at | timestamptz | requerido |

**PK**: `(tenant_id, counter_type)`; el incremento bloquea una sola fila dentro de la transacción.

## Catalog and media

### media_assets

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| storage_key | text | unique global, prefijado por tenant |
| public_url | text | se emite solo cuando está ready |
| checksum_sha256 | text | requerido |
| mime_type | text | allowlist de imágenes |
| byte_size | bigint | límite configurado |
| status | enum | `pending`, `ready`, `failed`, `archived` |
| created_at / updated_at | timestamptz | requeridos |

### catalog_categories

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| name / normalized_name | text | requerido; unique activo por tenant |
| description | text | nullable |
| sort_order | integer | >= 0 |
| status | enum | `draft`, `active`, `archived` |
| version | integer | control optimista |
| archived_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | requeridos |

### catalog_items

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| category_id | UUID | FK compuesta category |
| name / normalized_name | text | requerido; unique activo por tenant |
| description | text | nullable |
| price | numeric(12,2) | > 0 |
| currency | char(3) | igual a moneda soportada por tenant |
| image_asset_id | UUID | FK compuesta media, nullable |
| status | enum | `draft`, `active`, `unavailable`, `archived` |
| sort_order | integer | >= 0 |
| version | integer | control optimista |
| archived_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | requeridos |

### addon_groups

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| name | text | requerido |
| min_selected | integer | >= 0 |
| max_selected | integer | >= min_selected |
| sort_order | integer | >= 0 |
| status | enum | `draft`, `active`, `archived` |
| version | integer | control optimista |
| created_at / updated_at | timestamptz | requeridos |

### addon_options

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| group_id | UUID | FK compuesta addon_groups |
| name | text | requerido |
| price_delta | numeric(12,2) | puede ser 0; no negativo inicialmente |
| status | enum | `active`, `unavailable`, `archived` |
| sort_order | integer | >= 0 |
| version | integer | control optimista |

### item_addon_groups

Join entre ítems y grupos.

| Field | Type | Rules |
|---|---|---|
| tenant_id | UUID | FK tenants |
| item_id | UUID | FK compuesta catalog_items |
| addon_group_id | UUID | FK compuesta addon_groups |
| sort_order | integer | >= 0 |

**PK**: `(tenant_id, item_id, addon_group_id)`.

### catalog_combos

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| category_id | UUID | FK compuesta category |
| name / normalized_name | text | unique activo por tenant |
| description | text | nullable |
| price | numeric(12,2) | > 0; precio propio |
| currency | char(3) | requerido |
| image_asset_id | UUID | FK compuesta media, nullable |
| status | enum | `draft`, `active`, `unavailable`, `archived` |
| version | integer | control optimista |
| archived_at | timestamptz | nullable |

### combo_items

| Field | Type | Rules |
|---|---|---|
| tenant_id | UUID | FK tenants |
| combo_id | UUID | FK compuesta catalog_combos |
| item_id | UUID | FK compuesta catalog_items |
| quantity | integer | > 0 |
| sort_order | integer | >= 0 |

**PK**: `(tenant_id, combo_id, item_id)`.

## Cart and checkout

### carts

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| location_id | UUID | FK compuesta location |
| status | enum | `open`, `validated`, `checkout_started`, `converted`, `expired` |
| currency | char(3) | requerido |
| subtotal / discount_total / total | numeric(12,2) | total >= 0 |
| catalog_revision | bigint | revisión validada |
| verified_at / expires_at | timestamptz | requeridos cuando validated |
| version | integer | control optimista |
| created_at / updated_at | timestamptz | requeridos |

**Indexes**: `(tenant_id, expires_at)`, `(tenant_id, status, updated_at)`.

### cart_lines

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| cart_id | UUID | FK compuesta carts |
| item_id | UUID | FK compuesta item, nullable para combo |
| combo_id | UUID | FK compuesta combo, nullable para ítem |
| quantity | integer | > 0 |
| name_snapshot | text | requerido |
| unit_price_snapshot / line_total | numeric(12,2) | requeridos |
| image_url_snapshot | text | nullable |
| note | text | nullable |

**Validation**: exactamente uno de `item_id` o `combo_id`.

### cart_line_options

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| cart_line_id | UUID | FK compuesta cart_lines |
| addon_group_id / addon_option_id | UUID | FKs compuestas |
| name_snapshot | text | requerido |
| price_delta_snapshot | numeric(12,2) | requerido |
| quantity | integer | > 0 |

## Payments and integrations

### integration_accounts

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| provider | enum | `mercadopago` |
| provider_account_id | text | seller id, unique por provider |
| status | enum | `pending`, `active`, `expired`, `revoked`, `error` |
| encrypted_payload | bytea | access/refresh tokens cifrados |
| encryption_iv / auth_tag | bytea | requeridos |
| key_version | integer | requerido |
| scopes | text[] | concedidos |
| expires_at / last_verified_at | timestamptz | nullable |
| webhook_routing_key | UUID | unique, público pero no autorizante |
| version | integer | control optimista |
| created_at / updated_at | timestamptz | requeridos |

**Constraint**: un integration account activo de Mercado Pago por tenant en este alcance.

### provider_resource_routes

Índice global mínimo para descubrir tenant desde callbacks externos.

| Field | Type | Rules |
|---|---|---|
| provider | text | requerido |
| resource_type | text | `preference`, `payment`, `merchant_order` |
| external_id | text | requerido |
| tenant_id | UUID | FK tenants |
| integration_account_id | UUID | FK integration_accounts |
| local_resource_id | UUID | payment attempt relacionado |
| created_at | timestamptz | requerido |

**PK**: `(provider, resource_type, external_id)`. No contiene PII ni secretos.

### payment_attempts

Evolución de `checkout_payments`.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| cart_id | UUID | FK compuesta carts |
| integration_account_id | UUID | FK compuesta integration |
| provider_preference_id / provider_payment_id | text | nullable según estado |
| status | enum | `initiated`, `processing`, `pending`, `approved`, `rejected`, `failed`, `duplicate` |
| amount | numeric(12,2) | > 0 |
| currency | char(3) | requerido |
| customer_snapshot | jsonb | validado |
| notes | text | nullable |
| idempotency_key | text | unique por tenant |
| processed_at | timestamptz | nullable |
| failure_code | text | nullable, sanitizado |
| created_at / updated_at | timestamptz | requeridos |

### webhook_events

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| provider | text | requerido |
| provider_event_id | text | requerido |
| topic | text | requerido |
| signature_valid | boolean | requerido |
| status | enum | `received`, `processing`, `processed`, `ignored`, `failed` |
| payload | jsonb | sanitizado o cifrado según política |
| correlation_id | UUID | requerido |
| attempts | integer | >= 0 |
| processed_at | timestamptz | nullable |

**Unique**: `(tenant_id, provider, provider_event_id, topic)`.

## Orders and events

### orders

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| location_id | UUID | FK compuesta location |
| cart_id | UUID | FK compuesta carts |
| payment_attempt_id | UUID | FK compuesta payment, nullable para flujo directo |
| purchase_number | bigint | unique por tenant |
| source | enum | `mercadopago_webhook`, `admin_direct` |
| fulfillment_status | enum | `approved`, `preparing`, `ready`, `delivered`, `cancelled` |
| payment_status | enum | `pending`, `paid`, `failed`, `refunded` |
| customer_snapshot | jsonb | validado |
| notes | text | nullable |
| subtotal / discount_total / total | numeric(12,2) | requeridos |
| currency | char(3) | requerido |
| idempotency_key | text | unique por tenant |
| approved_at / delivered_at | timestamptz | nullable |
| version | integer | control de transición |
| created_at / updated_at | timestamptz | requeridos |

### order_lines

Snapshot histórico; no cambia al editar catálogo.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| order_id | UUID | FK compuesta orders |
| source_item_id / source_combo_id | UUID | nullable si elemento legado desapareció |
| name | text | requerido |
| quantity | integer | > 0 |
| unit_price / line_total | numeric(12,2) | requeridos |
| image_url | text | nullable |
| note | text | nullable |

### order_line_options

Snapshot de adicionales seleccionados con tenant, línea, nombre, precio y cantidad.

### order_events

Historial visible de transiciones.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| order_id | UUID | FK compuesta orders |
| sequence | bigint | monotónico por tenant |
| event_type | text | requerido |
| from_status / to_status | text | nullable |
| actor_user_id | UUID | nullable para procesos |
| occurred_at | timestamptz | requerido |
| metadata | jsonb | sanitizada |

**Unique**: `(tenant_id, sequence)`.

### outbox_events

Eventos persistidos en la misma transacción que el cambio de negocio.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| aggregate_type / aggregate_id | text / UUID | requeridos |
| event_type | text | requerido |
| payload | jsonb | sin secretos/PII no necesaria |
| sequence | bigint | monotónico por tenant |
| available_at / published_at | timestamptz | control de entrega |
| attempts | integer | >= 0 |

**Indexes**: `(tenant_id, sequence)`, `(published_at, available_at)`.

## Printing

### print_agents

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| location_id | UUID | FK compuesta location |
| name | text | requerido |
| token_prefix | text | unique global para lookup |
| token_digest | text | requerido; token plano no persistido |
| status | enum | `active`, `revoked` |
| last_seen_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | requeridos |

### print_jobs

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| location_id | UUID | FK compuesta location |
| order_id | UUID | FK compuesta orders |
| status | enum | `pending`, `processing`, `printed`, `failed`, `cancelled` |
| idempotency_key | text | unique por tenant |
| payload | jsonb | snapshot imprimible con branding tenant |
| attempt_count | integer | >= 0 |
| claimed_by_agent_id | UUID | FK compuesta agent, nullable |
| lease_expires_at / next_attempt_at | timestamptz | nullable |
| printed_at | timestamptz | nullable |
| last_error_code / last_error_message | text | sanitizados |
| created_at / updated_at | timestamptz | requeridos |

### print_job_attempts

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | FK tenants |
| print_job_id | UUID | FK compuesta print_jobs |
| agent_id | UUID | FK compuesta print_agents |
| attempt_number | integer | > 0 |
| status | enum | `claimed`, `printed`, `failed`, `lease_expired` |
| error_code / error_message | text | nullable |
| started_at / finished_at | timestamptz | requeridos según estado |

## Audit and migration

### audit_events

Append-only.

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| tenant_id | UUID | nullable solo para eventos de plataforma |
| actor_user_id | UUID | nullable |
| correlation_id | UUID | requerido |
| action / resource_type / resource_id | text / text / UUID | requeridos |
| outcome | enum | `allowed`, `denied`, `failed` |
| metadata | jsonb | allowlist; sin secretos ni payloads completos |
| occurred_at | timestamptz | requerido |

### migration_runs

| Field | Type | Rules |
|---|---|---|
| id | UUID | PK |
| target_tenant_id | UUID | FK tenants |
| source | text | `legacy_postgres`, `strapi`, `media` |
| phase | text | requerido |
| status | enum | `planned`, `running`, `reconciled`, `cutover_ready`, `completed`, `failed`, `rolled_back` |
| source_count / target_count / error_count | bigint | >= 0 |
| source_checksum / target_checksum | text | nullable |
| manifest | jsonb | configuración sin secretos |
| started_at / finished_at | timestamptz | nullable |

### migration_records

Mapa idempotente entre origen y destino.

| Field | Type | Rules |
|---|---|---|
| migration_run_id | UUID | FK migration_runs |
| source_type / source_id | text | requeridos |
| target_type / target_id | text / UUID | nullable si falló |
| source_checksum | text | requerido |
| status | enum | `imported`, `skipped`, `failed` |
| error_code | text | nullable |
| migrated_at | timestamptz | nullable |

**Unique**: `(migration_run_id, source_type, source_id)`.

## State transitions

### Tenant

```text
onboarding --readiness valid + owner action--> active
active --platform suspension--> suspended
suspended --issue resolved + authorized action--> active
```

No venta nueva se inicia fuera de `active`. Pagos y pedidos iniciados antes de suspensión pueden conciliarse.

### Catalog resource

```text
draft --> active
active <--> unavailable
draft|active|unavailable --> archived
```

`archived` es terminal para venta, no para lectura histórica.

### Cart

```text
open --> validated --> checkout_started --> converted
open|validated|checkout_started --> expired
```

Una revalidación puede devolver `checkout_started` a `validated` solo antes de crear un cobro y con confirmación del cliente.

### Payment attempt

```text
initiated --> processing --> pending --> approved
initiated|processing|pending --> rejected|failed
processing|approved --> duplicate (solo intento competidor)
```

`approved` no retrocede por eventos tardíos.

### Order fulfillment

```text
approved --> preparing --> ready --> delivered
approved|preparing --> cancelled
```

La transición usa compare-and-set sobre `version` y crea `order_events` + `outbox_events` en la misma transacción.

### Print job

```text
pending --> processing --> printed
processing --failure--> failed --retry due--> processing
processing --lease expired--> pending
pending|failed --> cancelled
```

`printed` es terminal; reportes repetidos son idempotentes.

### Integration account

```text
pending --> active
active --> expired|revoked|error
expired|error --OAuth refresh/reconnect--> active
```

No existe transición desde un token/API key ingresado manualmente. Todas las cuentas, incluido el tenant inicial, entran al modelo nuevo mediante OAuth.

### User identity

```text
pending_verification --single-use Core challenge--> active
pending_verification|active --administrative disable--> disabled
```

Solo Core consume el desafío y cambia el estado; `komanda-business` no escribe estas columnas.

## RLS policy classes

- **Tenant-owned CRUD**: `tenant_id = current_setting('app.tenant_id', true)::uuid` en `USING` y `WITH CHECK`.
- **Membership-aware admin**: además de tenant, el servicio verifica `user_id`, membresía activa y rol.
- **Public storefront read**: el servicio resuelve slug activo y abre una transacción de solo lectura con ese tenant.
- **Provider router**: `provider_resource_routes` expone solo lookup interno al rol de webhook; no es consultable por clientes.
- **Maintenance/migration**: rol separado, nunca utilizado por requests web o workers normales.

## Legacy mapping

| Current source | Target | Mapping |
|---|---|---|
| `admin_users` | `users` + `tenant_memberships` | conserva hash; manifest aporta email verificado del owner inicial |
| plan inicial del manifest | `plan_definitions` + `tenant_entitlement_snapshots` | Core valida `plan_id` y materializa la versión aceptada |
| `temporary_carts.items` JSON | `carts` + líneas/opciones | tenant inicial; snapshots preservados |
| `checkout_payments` | `payment_attempts` | referencias e idempotencia preservadas |
| `orders` | `orders` + `order_lines` | líneas reconstruidas desde carrito; anomalías bloquean corte |
| `print_jobs` | `print_jobs` + attempts | payload preservado y tenant/sede inicial agregados |
| `MP_ACCESS_TOKEN` | sin registro destino | no se importa; el tenant inicial completa OAuth antes del cutover de pagos |
| `PRINT_SERVICE_TOKEN` | `print_agents` | se emite token nuevo; el global se mantiene solo en ventana compatible |
| Strapi categories/items/combos | tablas de catálogo | `documentId` queda en `migration_records` |
| Strapi uploads | `media_assets` + object storage | copia verificada por checksum |

## Index budget

Índices mínimos para recorridos críticos:

- `tenants(normalized_slug)` unique;
- `tenant_memberships(user_id, status, tenant_id)`;
- `identity_verification_challenges(token_digest)` unique y `(user_id, expires_at)` para invalidar/reemitir;
- `tenant_entitlement_snapshots(tenant_id, effective_at DESC)` con unicidad parcial del snapshot vigente;
- `catalog_categories(tenant_id, status, sort_order)`;
- `catalog_items(tenant_id, category_id, status, sort_order)`;
- `catalog_combos(tenant_id, category_id, status, sort_order)`;
- `carts(tenant_id, expires_at)`;
- `payment_attempts(tenant_id, provider_payment_id)`;
- `orders(tenant_id, fulfillment_status, approved_at DESC)`;
- `order_events(tenant_id, sequence)`;
- `print_jobs(tenant_id, location_id, status, next_attempt_at)`;
- `outbox_events(published_at, available_at)`;
- `audit_events(tenant_id, occurred_at DESC)`.
