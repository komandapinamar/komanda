Resumen Ejecutivo
No hice cambios; analicé el proyecto en modo solo lectura.
El proyecto actual es un buen prototipo single-tenant: Next.js + Strapi + Neon/Postgres + MercadoPago + worker local de impresión. Pero todavía no está listo como SaaS multi-tenant. La migración no debería empezar por subdominios, sino por introducir tenant_id, credenciales por negocio, catálogo por tenant, órdenes con snapshot completo e impresión por local/impresora.
Arquitectura Actual
Parte Estado actual
Web/app Next.js 16, React 19, Tailwind, API routes y panel admin
CMS Strapi 5 separado para catálogo
DB Neon/Postgres con Drizzle
Pagos MercadoPago con token global
Impresión Worker Python local por polling, ESC/POS USB
Infra No hay Docker, CI ni OpenTofu todavía
Flujo actual:

- Strapi carga MenuItem, Category, Combo.
- ~~Next consulta Strapi con STRAPI_URL y STRAPI_FULL_ACCESS_TOKEN~~ (Eliminado - el catálogo ahora se sirve desde Core PostgreSQL)
- El carrito se valida y se guarda temporalmente en Postgres: src/app/api/cart/route.ts:40-74.
- MercadoPago crea la preferencia: src/features/shop/payments/server/mercadopago.service.ts:91-131.
- Al confirmar pago se crea orden y print job: src/features/shop/payments/server/payment-confirmation.service.ts:286-345.
- El worker reclama trabajos e imprime: src/app/api/print-jobs/claim/route.ts:16-39.
Estado SaaS
Hoy el sistema está fuertemente pensado para una sola empresa.
Riesgos principales:
- No existe tenant_id en temporary_carts, checkout_payments, orders, print_jobs ni admin_users: src/db/schema.ts:25-203.
- Las credenciales son globales: Strapi, MercadoPago, admin JWT y print token.
- El admin solo tiene username y passwordHash, sin tenant ni roles: src/db/schema.ts:197-203.
- La cola de impresión es global y cualquier worker reclama el siguiente job disponible: src/features/shop/payments/server/print-job.store.ts:89-133.
- Las órdenes no guardan líneas de pedido como entidad propia; dependen del carrito temporal o del payload de impresión.
- El cron de cleanup queda abierto si falta CRON_CART_CLEANUP_SECRET: src/app/api/cron/cart-cleanup/route.ts:8-20.
- MP_WEBHOOK_SECRET parece opcional en el webhook, lo cual no conviene en producción.
- dangerouslyAllowLocalIP está activo para imágenes: src/next.config.ts:4-6.
Strapi (ELIMINADO - Julio 2026)
El catálogo fue migrado a Core PostgreSQL y el directorio `cms/` fue eliminado. Strapi ya no es una dependencia operativa.
Problemas que motivaron la migración:
- MenuItem, Category y Combo tenían name único global, incompatible con multi-tenant.
- Faltaban active, available, sortOrder, slug, modificadores, adicionales, stock, horarios, variantes y precios por local.
- image era requerida pero estaba comentada en el componente de producto.
- Combo existía en CMS pero no estaba completamente integrado al flujo de compra.
WordPress
Sí podrías usar WordPress para que el cliente personalice la página de inicio, pero no lo recomiendo como primera decisión.
Mejor opción para SaaS:
- Crear un builder simple propio con bloques: hero, banner, horarios, redes, productos destacados, promos, texto libre e imágenes.
- Guardar la home como tenant_homepage_config o tenant_homepage_blocks.
- Renderizar la landing desde Next según el tenant.
- Mantener el catálogo y checkout fuera de WordPress.
Usaría WordPress solo si el cliente necesita una experiencia editorial avanzada tipo page builder. En ese caso conviene usarlo headless y solo para marketing content. No mezclaría WordPress + Strapi + Next + pagos + impresión para el núcleo del SaaS, porque aumenta mucho la operación.
Multi-Tenant
Para komanda.com y negocio.komanda.com, la dirección correcta sería:
- komanda.com: landing comercial de la plataforma.
- negocio.komanda.com: tienda pública del negocio.
- negocio.komanda.com/admin: panel del negocio.
- Más adelante: dominios custom tipo pedidos.negocio.com.
Modelo base recomendado:
- tenants: negocio, slug, estado, plan.
- tenant_domains: hostnames, dominio primario, verificación.
- locations: sucursales/locales del tenant.
- users, memberships, roles: usuarios por tenant.
- categories, products, modifier_groups, modifiers, combos: catálogo por tenant.
- payment_accounts: MercadoPago/OAuth/token por tenant.
- orders, order_items, payments: transaccional por tenant.
- printers, print_workers, print_jobs: impresión por tenant/local/impresora.
- tenant_settings, branding, homepage_blocks: personalización.
Migración recomendada:

1. Crear un tenant inicial para el negocio actual.
2. Agregar tenant_id a tablas actuales.
3. Migrar todos los datos existentes al tenant inicial.
4. Resolver tenant por hostname en cada request.
5. Cambiar todas las queries para filtrar por tenant_id.
6. Hacer credenciales por tenant, empezando por MercadoPago y print token.
7. Separar catálogo por tenant.
8. Agregar onboarding de negocios y configuración de subdominio.
9. Recién después habilitar self-service y planes.
Impresión
La base actual es buena para prototipo: worker local con polling y ESC/POS USB.
Pero para producción faltan piezas importantes:

- processing puede quedar trabado si el worker muere después de reclamar el job.
- Puede haber duplicados si imprime bien pero falla el reporte printed.
- No hay worker_id, attempt_id, leased_until ni requeue de trabajos vencidos.
- No hay soporte de impresoras por red, CUPS, IPP o TCP 9100.
- La marca del ticket está hardcodeada como HAMBURGUESAS DE AUTOR: print-service/print_worker.py:209-211.
Sobre prescindir de app:
- Una impresora WiFi no elimina necesariamente la necesidad de una app.
- La nube normalmente no puede llegar a una impresora dentro de una red privada/NAT.
- Sin app local solo es viable con impresoras cloud-native o protocolos del fabricante.
- Para gastronomía real, lo más robusto es cloud queue + agente local.
Plan Tauri/Electron:
- Primero endurecer backend de impresión.
- Después crear app local con pairing por código, selección de tenant/local/impresora, logs, autostart y healthcheck.
- Soportar usb, network TCP 9100 y cups.
- Mantener spool local SQLite para evitar pérdidas y manejar duplicados.
- Tauri es más liviano; Electron puede ser más rápido si querés usar ecosistema Node de impresión. Como ya existe Python, una primera versión con sidecar Python es pragmática.
Infra/OpenTofu
Antes de OpenTofu conviene cerrar la arquitectura objetivo. Luego definir módulos:
- DNS wildcard *.komanda.com.
- Certificados TLS.
- Hosting Next.js.
- Postgres gestionado con backups.
- Storage S3-compatible para imágenes.
- ~~Strapi si se mantiene, con Postgres y storage externo~~ (Eliminado - catálogo en Core)
- Secrets manager.
- Jobs/cron.
- Observabilidad: logs, métricas, Sentry.
- CI/CD con lint, build, typecheck y tests.
También conviene unificar versiones Node. Hoy hay Node 24 en mise.toml, Node 22 en Nixpacks: mise.toml:1-2, src/nixpacks.toml:1-2.
Roadmap Recomendado

 1. Convertir el modelo a multi-tenant con un tenant inicial.
 2. Persistir order_items y snapshots completos de pedido.
 3. Hacer credenciales por tenant: pagos, impresión, branding.
 4. ~~Definir si Strapi queda o se reemplaza por admin propio~~ (Completado - Strapi fue reemplazado por catálogo en Core)
 5. Crear CRUD de catálogo pensado para gastronómicos.
 6. Robustecer print queue con leases, workers, impresoras y reintentos idempotentes.
 7. Preparar subdominios wildcard y resolución por host.
 8. Agregar Docker/CI/testing antes de infraestructura cloud definitiva.
 9. Implementar OpenTofu para prod/staging.
10. Recién después crear la app Tauri/Electron de impresión.
Mi recomendación fuerte: para un SaaS escalable, mantené Next + Postgres como núcleo transaccional, usá Strapi solo temporalmente o para contenido no crítico, evitá WordPress salvo para una necesidad editorial clara, y diseñá impresión como un sistema cloud + agente local por tenant/local.
