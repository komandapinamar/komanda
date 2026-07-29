# Phase 0 Research: Plataforma multi-tenant autoservicio

**Date**: 2026-07-05
**Scope**: decisiones necesarias para migrar el Core actual de un único negocio a una plataforma compartida y aislada para múltiples tenants.

## 1. Modelo de tenancy

**Decision**: usar una única base PostgreSQL y un esquema compartido. Toda tabla tenant-owned tendrá `tenant_id UUID NOT NULL`, índices cuyo primer componente sea `tenant_id`, unicidad por tenant y claves foráneas compuestas que impidan relacionar registros de negocios distintos.

**Rationale**: el objetivo validado es de al menos 100 tenants y 50 operadores simultáneos. Un esquema compartido aprovecha el pool actual, permite migraciones únicas y evita el costo operativo de una base o esquema por negocio. Los UUID globales simplifican contratos, mientras las restricciones compuestas hacen que el aislamiento no dependa solamente de filtros de aplicación.

**Alternatives considered**:

- Una base por tenant: mayor aislamiento físico, pero aprovisionamiento, migraciones, pooling, backups y observabilidad crecen linealmente con cada alta.
- Un schema por tenant: reduce parte del costo de bases separadas, pero sigue multiplicando migraciones y depende de `search_path`, incompatible como estado persistente con pooling transaccional.
- Particionar tablas desde el primer release: no aporta valor para el volumen objetivo y complica claves únicas y migraciones. Se revisará cuando órdenes o eventos alcancen decenas de millones de filas o los índices de tenant dejen de cumplir los presupuestos.

## 2. Doble barrera de aislamiento

**Decision**: combinar autorización obligatoria en servicios Core con PostgreSQL Row-Level Security. Las rutas y jobs resuelven un `TenantContext` tipado; los repositorios tenant-aware solo operan dentro de `withTenantTransaction(context, callback)`, que establece `app.tenant_id` y `app.user_id` como configuración local a la transacción. Las tablas se ejecutan con un rol runtime sin `BYPASSRLS`, diferente del rol propietario de migraciones, y usan `ENABLE/FORCE ROW LEVEL SECURITY`.

**Rationale**: PostgreSQL aplica default-deny cuando RLS está habilitado sin una política válida, pero propietarios y roles `BYPASSRLS` pueden evitarla; por eso separar roles y forzar RLS es parte del diseño. La capa de aplicación sigue validando membresías y estados porque RLS no reemplaza las reglas de autorización ni los mensajes del dominio.

**Alternatives considered**:

- Solo filtros `WHERE tenant_id = ...`: simples, pero una consulta omitida puede exponer datos.
- Solo RLS: insuficiente para permisos de negocio, resolución de contexto y contratos.
- Un rol PostgreSQL por tenant: no escala operacionalmente y no es necesario para este volumen.

**Sources**:

- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Drizzle ORM Row-Level Security](https://orm.drizzle.team/docs/rls)

## 3. Conexiones PostgreSQL portables y contexto transaccional

**Decision**: mantener `DATABASE_URL` para tráfico runtime y `DATABASE_DIRECT_URL` para migraciones, con un driver PostgreSQL TCP estándar detrás del adaptador de persistencia. Nunca depender de `SET` a nivel de sesión. El contexto RLS se configura dentro de la misma transacción interactiva que ejecuta las consultas mediante `set_config(..., true)`.

**Rationale**: Neon development puede usar pooling transaccional y Azure production tendrá límites, red y failover distintos. El aislamiento no puede depender de transporte, pool o comportamiento de sesión específico de un proveedor. Las transacciones locales y Drizzle permiten conservar la misma semántica RLS en PostgreSQL efímero, Neon y Azure.

**Alternatives considered**:

- Conexiones directas para todo el tráfico: reduce la utilidad del pool y aumenta el riesgo de agotar conexiones.
- Contexto de sesión persistente: incorrecto con transaction pooling.
- Incluir solo `tenant_id` en cada query sin contexto RLS: se mantiene como filtro explícito, pero no como única barrera.
- Mantener `@neondatabase/serverless` como requisito del repositorio: acopla producción a un transporte que Azure PostgreSQL no ofrece.

**Sources**:

- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions)

## 4. Autenticación y membresías

**Decision**: reemplazar `admin_users` y el JWT global de rol `admin` por identidades globales, sesiones revocables y membresías por tenant. La cookie web contiene un token opaco aleatorio y clientes no web pueden presentarlo como bearer mediante el adaptador versionado; solo se almacena su digest y cada operación protegida vuelve a validar usuario, sesión, membresía, rol y estado del tenant. Los servicios de autenticación y autorización no dependen de Server Actions.

Core crea las identidades nuevas como `pending_verification`, genera desafíos de email de un solo uso con digest, expiración y consumo atómico, y es la única autoridad que puede marcar una identidad como verificada. `komanda-business` presenta la UX y llama al contrato versionado, pero no firma ni persiste una afirmación autoritativa de verificación.

La entrega queda detrás de un puerto de Core: las pruebas usan un capture sink y el adaptador de producción se selecciona/configura por ambiente sin mover generación, expiración o validación al cliente externo.

**Rationale**: una persona puede pertenecer a varios negocios y una membresía revocada debe dejar de autorizar inmediatamente. Mantener el tenant dentro de un JWT sin consulta produciría permisos obsoletos y multiplicaría sesiones por negocio.

**Alternatives considered**:

- Extender el JWT actual con `tenant_id`: rápido, pero dificulta cambio de tenant, revocación y membresías múltiples.
- Duplicar usuarios por tenant: rompe la identidad global requerida.
- Introducir un proveedor externo de identidad en esta migración: amplía el alcance y no es necesario para resolver el aislamiento; el servicio queda preparado para adaptadores futuros.

## 5. Integración Mercado Pago multi-seller

**Decision**: usar exclusivamente OAuth Authorization Code para conectar todos los negocios a la aplicación de Komanda. Persistir por tenant el seller id, scopes, expiración y access/refresh tokens cifrados. El token global actual no se importa al modelo multi-tenant: permanece únicamente en el release legado previo al corte y el tenant inicial debe completar OAuth antes de cambiar el tráfico de pagos.

**Rationale**: la documentación de Marketplace exige un access token por vendedor obtenido mediante OAuth. Esto evita pedir al comerciante que copie credenciales permanentes y permite renovación o revocación explícita. El dashboard presenta “Conectar Mercado Pago” y el estado de la autorización.

**Alternatives considered**:

- Caja de texto o importación manual de access token por tenant: aumenta exposición, errores de copia y trabajo de rotación, y queda explícitamente fuera del flujo operacional y de recuperación de esta versión.
- Una credencial global: dirigiría fondos y permisos a una sola cuenta y viola el aislamiento.
- Una aplicación de Mercado Pago diferente por tenant: traslada configuración técnica a cada negocio y complica webhooks.

**Sources**:

- [Mercado Pago OAuth](https://www.mercadopago.com.ar/developers/en/docs/security/oauth)
- [Mercado Pago marketplace integration](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro/how-tos/integrate-marketplace)

## 6. Cifrado y enrutamiento de secretos

**Decision**: cifrar tokens de integración en la aplicación con AES-256-GCM, IV aleatorio por valor, AAD `tenant_id + provider + credential_id`, tag de autenticación y `key_version`. La clave maestra vive fuera de PostgreSQL y admite rotación. Las respuestas solo incluyen estado, seller id parcial, expiración y timestamps.

Los webhooks validan primero `x-signature` con el secreto de la aplicación, luego resuelven un routing key no sensible y exigen que tenant, cuenta de integración, payment attempt y recurso externo coincidan. Un índice global mínimo de recursos del proveedor permite descubrir el tenant sin exponer datos comerciales; todo procesamiento posterior entra en una transacción tenant-aware.

**Rationale**: cifrado autenticado detecta alteraciones y AAD impide mover ciphertext entre tenants. La firma del webhook autentica el origen; la correlación persistida evita confiar en parámetros suministrados por el proveedor como única fuente de tenancy.

**Alternatives considered**:

- Secretos en texto plano en PostgreSQL: exposición total ante lectura accidental o backup.
- Cifrado dentro de PostgreSQL con la clave enviada en cada query: aumenta la superficie de logs y mantiene clave y ciphertext en el mismo límite.
- Determinar tenant solo desde metadata del webhook: no protege contra referencias contradictorias.

**Sources**:

- [Node.js authenticated encryption APIs](https://nodejs.org/api/crypto.html)
- [Mercado Pago Webhook signature validation](https://www.mercadopago.com.ar/developers/en/docs/zero-dollar-auth/additional-content/your-integrations/notifications/webhooks)

## 7. Catálogo y archivos

**Decision**: migrar categorías, ítems y combos a tablas relacionales de Core; agregar grupos/opciones de adicionales y relaciones explícitas. Mantener UUID internos y conservar `documentId` únicamente en tablas de mapeo de migración. Las imágenes se copian a object storage compatible con S3 y se registran en `media_assets` con checksum, tipo, tamaño y estado.

Las cargas nuevas usan URL prefirmada, verificación posterior y una clave de objeto que incluye tenant y UUID. El navegador nunca recibe credenciales del bucket.

**Rationale**: el filesystem de Strapi no es una fuente durable para múltiples despliegues y los identificadores del CMS no deben definir el dominio futuro. Los checksums permiten reconciliar la migración y evitar copiar archivos corruptos o duplicados.

**Alternatives considered**:

- Guardar imágenes como binarios en PostgreSQL: aumenta tamaño, backups y tráfico de la base transaccional.
- Mantener Strapi como biblioteca de medios: conserva una dependencia operativa prohibida.
- URLs externas arbitrarias: no ofrecen control de disponibilidad, integridad o tenancy.

**Source**:

- [Amazon S3 uploads with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)

## 8. Pedidos en vivo y efectos asíncronos

**Decision**: introducir `outbox_events` transaccional. Crear/actualizar pedidos, pagos y trabajos registra el evento en la misma transacción. El stream de pedidos consulta incrementalmente por `tenant_id + sequence` en vez de volver a leer y serializar todos los pedidos cada dos segundos. Un adaptador de publicación puede sustituir el polling incremental más adelante sin cambiar el dominio.

**Rationale**: el SSE actual hace una consulta y serialización completa por conexión cada dos segundos. Un cursor incremental limita el trabajo al tenant y evita perder eventos entre confirmación de pago, creación de pedido e impresión.

**Alternatives considered**:

- Mantener snapshots completos: aceptable para un negocio, pero crece con conexiones, tenants y pedidos activos.
- `LISTEN/NOTIFY` como contrato primario: Neon transaction pooling no conserva estado de sesión y no ofrece persistencia/replay.
- Introducir un broker externo ahora: agrega infraestructura antes de que el volumen objetivo la justifique.

## 9. Cola de impresión

**Decision**: registrar agentes por tenant y sede con tokens aleatorios hasheados y prefijo de lookup. Cada claim se limita al alcance del agente y usa un lease con expiración; los jobs abandonados vuelven a estar disponibles. Claims concurrentes se serializan con bloqueo de fila y `SKIP LOCKED`; cada resultado se guarda como intento y la clave idempotente es única dentro del tenant.

**Rationale**: el token global actual permite reclamar cualquier ticket y un job en `processing` puede quedar bloqueado si el worker muere. Leases e historial permiten recuperación sin duplicar el efecto lógico.

**Alternatives considered**:

- Un token global con `tenant_id` enviado por el worker: el cliente podría elegir otro tenant.
- Una cola por despliegue de tenant: multiplica infraestructura.
- Borrar jobs impresos: elimina trazabilidad e impide conciliación.

**Source**:

- [PostgreSQL explicit and row-level locking](https://www.postgresql.org/docs/current/explicit-locking.html)

## 10. Migraciones y despliegue

**Decision**: usar migraciones SQL versionadas generadas por Drizzle y complementadas con migraciones custom; `db:push` queda solo para desarrollo. El rollout sigue expand → seed → dual-read/shadow-check controlado → backfill → validate → cutover → contract cleanup.

Columnas nuevas comienzan nullable cuando una tabla ya contiene datos. El backfill se ejecuta en lotes idempotentes. Foreign keys se agregan `NOT VALID`, luego se validan; índices grandes se crean concurrentemente cuando corresponda. Solo después se aplican `NOT NULL`, RLS forzada y retiro de columnas/rutas legadas.

**Rationale**: separar expansión, backfill y contracción evita un cambio destructivo único y permite detenerse o volver al release anterior antes de abrir escrituras en la nueva fuente.

**Alternatives considered**:

- Reemplazo total en una sola migración: incrementa locks, downtime y riesgo de rollback.
- Dual-write indefinido a Strapi y Core: crea dos fuentes de verdad y exige conciliación permanente.
- `db:push` directo en producción: no deja un artefacto SQL revisable ni una secuencia explícita de backfill/cutover.

**Sources**:

- [Drizzle migration fundamentals](https://orm.drizzle.team/docs/migrations)
- [Drizzle generate and custom migrations](https://orm.drizzle.team/docs/drizzle-kit-generate)
- [PostgreSQL ALTER TABLE and constraint validation](https://www.postgresql.org/docs/current/sql-altertable.html)

## 11. Resolución de tenant en Next.js

**Decision**: `proxy.ts` solo normaliza host/ruta y adjunta una pista interna firmada o reescribe hacia la superficie adecuada; no consulta la base ni autoriza. Las rutas y servicios resuelven el slug o tenant id contra Core y validan membresía/estado. Contextos aceptados:

- tienda: host/subdominio o ruta versionada;
- administración: tenant id seleccionado más membresía vigente;
- webhook: firma, routing key y correlación persistida;
- impresión: identidad del agente;
- jobs: tenant id persistido en el job.

**Rationale**: Next.js indica que Proxy sirve para rewrites y verificaciones optimistas, no para gestión completa de sesiones o autorización. Separar resolución de autorización mantiene el dominio reutilizable.

**Alternatives considered**:

- Resolver y autorizar completamente en Proxy: acopla lógica a la capa web y agrega consultas en cada request.
- Aceptar un header `X-Tenant-Id` del navegador: permite elegir un tenant sin prueba de autoridad.
- Mantener un tenant implícito: viola fail-closed y hace imposible detectar contexto faltante.

**Source**:

- [Next.js Proxy](https://nextjs.org/docs/app/getting-started/proxy)

## 12. Pruebas y observabilidad

**Decision**: incorporar:

- Vitest para dominio, repositorios y contratos;
- una base PostgreSQL aislada con migraciones reales para integración y RLS;
- Playwright para registro, cambio de tenant, catálogo, checkout y dashboard;
- pytest para el agente de impresión;
- una matriz obligatoria con tenant A, tenant B, ids cruzados, jobs, webhook y procesos de fondo;
- pruebas de migración repetible sobre snapshot anonimizado;
- prueba de carga con 100 tenants y 50 operadores;
- logs estructurados con `correlation_id`, `tenant_id` seguro, actor, operación y resultado, sin secretos ni payloads de cliente.

**Rationale**: el repositorio no contiene tests actuales. La migración cambia fronteras de seguridad, persistencia y efectos externos, por lo que unit tests aislados no prueban las propiedades críticas.

**Alternatives considered**:

- Solo pruebas unitarias: no validan RLS, transacciones, contratos ni backfill.
- Probar únicamente el tenant inicial: no detecta exposición cruzada.
- Usar datos reales sin anonimizar: riesgo de privacidad y credenciales.

## 13. Frontera con komanda-business y planes

**Decision**: `komanda-business`, implementado con Astro, es dueño del contenido de adquisición, presentación/selección de planes y formulario público de registro. Envía a Core una solicitud versionada server-to-server con un `plan_id` estable y los datos necesarios; Core valida el identificador y crea atómicamente usuario, tenant, sede inicial, membresía y snapshot de entitlements. No se comparte base de datos.

Core conserva un catálogo operacional de definiciones de plan aceptadas y materializa un snapshot inmutable por tenant. `komanda-business` puede cambiar textos, diseño o posicionamiento comercial sin alterar la autoridad operacional; cualquier alta o cambio de plan entra en vigor únicamente después de ser aceptado por Core.

Las definiciones se mantienen como datos versionados en código y migraciones revisables de Core. La primera versión reconoce los flags `catalog_management`, `online_payments` y `printing`; los servicios correspondientes los aplican con default-deny ante valores ausentes, desconocidos o deshabilitados. No existe backoffice ni sincronización automática de planes desde `komanda-business`.

**Rationale**: el repositorio público de `komanda-business` declara explícitamente que posee marketing, planes y experiencia de registro, mientras cuentas operacionales, tenants y membresías pertenecen a Core. Recibir solo un identificador evita confiar en límites enviados por un cliente externo y mantiene la aplicación de capacidades en el sistema que ejecuta esas capacidades.

**Alternatives considered**:

- Persistir usuarios/tenants en `komanda-business` y replicarlos: crea dos fuentes de verdad y falla ante sincronización parcial.
- Enviar un snapshot de límites decidido por `komanda-business`: permite que un consumidor externo defina autorización operacional.
- Alojar el formulario en Core: contradice la frontera de producto confirmada.

## 14. Alcance del primer slice técnico

**Decision**: el primer slice implementable termina en provisioning, verificación administrada por Core, aislamiento, selección de tenant y onboarding/readiness. No activa ventas: la activación operacional requiere que los slices de catálogo y OAuth de Mercado Pago estén completos.

**Rationale**: separar el hito técnico evita declarar un tenant vendible antes de satisfacer los prerrequisitos explícitos de activación, pero permite validar temprano la frontera de seguridad y el contrato con `komanda-business`.

## 15. Bootstrap temporal sin komanda-business

**Decision**: mientras el consumidor Astro no esté funcional, desarrollo local usa una fixture determinística que crea un único tenant mock invocando el mismo schema de request y servicio de provisioning de Core. El script verifica el ambiente y falla en producción; no agrega endpoints, tablas, bypass de autenticación, contexto implícito ni fallback de tenant.

Las suites de contrato pueden reutilizar el payload mock, pero las pruebas constitucionales de aislamiento mantienen fixtures separadas A/B. El tenant mock facilita desarrollo manual y nunca cuenta como evidencia suficiente de aislamiento.

**Rationale**: desacopla el avance de Core del calendario de `komanda-business` sin crear un segundo camino de alta que luego deba migrarse o pueda debilitar la frontera multi-tenant.

**Source**:

- [komanda-business README](https://github.com/komandapinamar/komanda-business/blob/main/README.md)

## 16. Matriz de bases por ambiente con OpenTofu

**Decision**: usar PostgreSQL 17 efímero para CI/local, un proyecto Neon exclusivamente para development remoto y dos Azure Database for PostgreSQL Flexible Server independientes para staging y producción. Neon y Azure viven en roots y estados OpenTofu separados. Drizzle conserva la autoridad sobre schema, RLS, grants y datos en todos los targets.

El root Neon contiene una guarda que sólo acepta `development`; no existen tfvars Neon de staging o producción. El root Azure sólo acepta `staging` o `production`, crea red y DNS privados y bloquea acceso público. Producción exige alta disponibilidad, al menos 14 días de backup y una SKU no burstable; staging reproduce versión, red, roles, migraciones y RLS con menor capacidad.

El rol `komanda_runtime` se crea mediante bootstrap SQL controlado con `NOSUPERUSER NOBYPASSRLS` en ambos proveedores. En Neon no se crea mediante API porque heredaría privilegios incompatibles con RLS. En Azure, el bootstrap y las migraciones se ejecutan desde una identidad y ruta de red autorizadas dentro de la red privada.

Cada estado se almacena en una key Azure Blob diferente: Neon development, Azure staging y Azure production. Se usa autenticación Microsoft Entra, versionado, soft-delete y locking. Producción usa `prevent_destroy`, password write-only, plan binario revisado y apply manual; no se permite `-auto-approve`. Neon nunca recibe backups, credenciales ni datos identificables productivos.

**Alternatives considered**:

- Neon para todos los ambientes: menor costo inicial, pero producción quedaría en AWS mientras cómputo, secretos, colas y observabilidad se concentran en Azure.
- Neon para development y testing sin Azure staging: rechazada porque no detecta diferencias de roles, red privada, pooling, failover y capacidad antes de producción.
- Azure también para development: ofrece máxima paridad, pero agrega costo y lead time innecesarios mientras exista una suite obligatoria sobre Azure staging.

**Sources**:

- [Azure PostgreSQL Flexible Server con OpenTofu/Terraform](https://learn.microsoft.com/en-us/azure/developer/terraform/azurerm/deploy-postgresql-flexible-server-database)
- [Azure PostgreSQL private networking](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private)
- [Azure PostgreSQL high availability](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-high-availability)

## Resolution Status

Todos los puntos de Technical Context quedan resueltos y no permanecen decisiones abiertas.
