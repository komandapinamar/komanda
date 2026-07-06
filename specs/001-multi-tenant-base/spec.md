# Feature Specification: Plataforma multi-tenant autoservicio

**Feature Branch**: `feature/001-multitenant-structure`

**Created**: 2026-07-01

**Updated**: 2026-07-06

**Status**: Draft

**Input**: User description: "Migrar Komanda de un único negocio a un esquema multi-tenant donde múltiples negocios puedan registrarse desde la experiencia de adquisición de komanda-business y operar de forma aislada en Core, administrando catálogo, pedidos, pagos e impresión desde su dashboard, configurando sus propias credenciales de Mercado Pago y reemplazando la dependencia operativa de Strapi."

## System Boundaries *(mandatory)*

- **Owning Repository**: Core (Next.js)
- **Affected Surfaces**: contrato de aprovisionamiento consumido por `komanda-business`; panel administrativo de `app.komanda.com`; tienda de cada tenant; contratos para clientes externos y futuros; procesamiento de pagos; procesos en segundo plano; y agentes de impresión. La experiencia pública de registro y selección de plan pertenece a `komanda-business`; Strapi participa únicamente como origen de la migración del catálogo existente.
- **Source of Truth**: Core es la fuente autoritativa de usuarios, negocios, membresías, sedes, definiciones versionadas de plan, snapshots de entitlements, catálogo, carritos, configuración operativa, credenciales de integración, pagos, pedidos y trabajos de impresión.
- **External Contract**: `komanda-business` envía mediante un contrato versionado un `plan_id` estable y los datos de la persona propietaria y del negocio; Core valida el identificador, resuelve un snapshot versionado de entitlements y crea atómicamente usuario pendiente de verificación, tenant, sede inicial, membresía propietaria y configuración de acceso. Core genera, entrega y valida el desafío de verificación de identidad mediante un contrato versionado; `komanda-business` puede presentar esa UX, pero no declarar una identidad verificada. También se crean o amplían contratos versionados para autenticación, selección de negocio, catálogo, carritos, pedidos, pagos e impresión. Los consumidores existentes deben conservar compatibilidad durante una ventana de transición documentada.
- **Temporary Development Input**: mientras `komanda-business` no esté funcional, los entornos locales y de prueba pueden aprovisionar un tenant mock mediante una fixture que invoque el mismo contrato y servicio de aplicación de Core. La fixture no puede escribir directamente en la base, construir un contexto privilegiado ni habilitarse en producción.
- **Failure Isolation**: la indisponibilidad del cliente público de adquisición no impide que negocios existentes operen. Luego del corte, la indisponibilidad de Strapi no afecta tiendas ni paneles. Una indisponibilidad de Mercado Pago bloquea nuevos cobros en línea sin afectar catálogo o consulta de pedidos; una indisponibilidad del agente de impresión conserva trabajos pendientes y no revierte pagos ni pedidos.
- **Tenant Impact**: todo registro, acción, proceso, notificación externa y credencial debe pertenecer a un negocio explícito y autorizado. Un contexto ausente, ambiguo o contradictorio debe fallar de forma cerrada, sin recurrir al negocio inicial o a una configuración global.
- **Future Client Compatibility**: aprovisionamiento, autenticación, catálogo, carrito, checkout, configuración, pedidos, pagos e impresión deben poder consumirse mediante contratos reutilizables por clientes móviles u otros clientes futuros, sin depender de una interfaz web específica.
- **Persistence Environments**: Neon se limita a desarrollo remoto y datos sintéticos. Staging y producción usan instancias Azure PostgreSQL independientes; staging es la validación preproductiva obligatoria y debe reproducir la versión mayor, extensiones, migraciones, roles runtime, RLS y comportamiento de conexión de producción. Las pruebas locales y de CI usan PostgreSQL efímero y no sustituyen la aceptación sobre Azure staging.

## Clarifications

### Session 2026-07-06

- Q: ¿Dónde se ejecutará PostgreSQL por ambiente? → A: Neon se usará únicamente para development remoto; Azure PostgreSQL se usará en staging y producción, con recursos, credenciales y estados de infraestructura separados.
- Q: ¿Puede Neon ser la única representación de producción durante las pruebas? → A: No. Azure staging es obligatorio para validar migraciones, RLS, roles, conectividad, pooling, restore y carga antes de promover a producción.
- Q: ¿Puede copiarse información productiva a Neon para depurar? → A: No. Neon development solo admite fixtures sintéticas o datos anonimizados aprobados que no permitan reconstruir información personal, comercial ni credenciales productivas.

### Session 2026-07-05

- Q: ¿Qué responsabilidad exacta tendrá cada repositorio durante el registro? → A: `komanda-business` captura el plan y los datos mediante su experiencia Astro; Core valida la solicitud y crea atómicamente usuario, tenant, sede, membresía y acceso operacional.
- Q: ¿Qué información del plan debe recibir Core? → A: `komanda-business` envía un `plan_id`; Core lo valida y guarda un snapshot versionado de entitlements que aplica como autoridad operacional.
- Q: ¿Cómo se aplicarán los entitlements en la primera versión? → A: Core hará enforcement desde el inicio sobre un conjunto mínimo de flags operacionales versionados; una capacidad opcional ausente o desconocida se deniega de forma cerrada.
- Q: ¿Quién verifica la identidad de la propietaria? → A: Core genera y valida la verificación; `komanda-business` presenta la experiencia, pero no puede afirmar por sí mismo que una identidad está verificada.
- Q: ¿Cómo se administrarán los planes aceptados por Core? → A: Las definiciones y versiones de plan se mantienen como datos versionados en código y migraciones de Core; no habrá backoffice ni sincronización autoritativa desde `komanda-business` en esta versión.
- Q: ¿Cómo conectará cada tenant su cuenta de Mercado Pago? → A: Exclusivamente mediante OAuth para operación normal; no habrá ingreso manual de API keys y el tenant inicial deberá reconectarse antes del cutover de pagos.
- Q: ¿Qué incluye el primer MVP técnico? → A: Aprovisionamiento, verificación, aislamiento, selección de tenant y onboarding/readiness sin activar ventas; la activación operacional llega después de catálogo y pagos.
- Q: ¿Cómo se desarrollará Core mientras `komanda-business` no esté funcional? → A: Se usará una fixture de un tenant mock solo en desarrollo/pruebas, pasando por el mismo contrato y servicio de provisioning; nunca será un fallback ni una entrada habilitada en producción.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aprovisionar y preparar un negocio registrado externamente (Priority: P1)

Una persona completa la selección de plan y el formulario de registro en `komanda-business`. Ese sistema solicita el aprovisionamiento a Core y, cuando la operación indivisible termina correctamente, la persona accede como propietaria al dashboard separado de su nuevo negocio.

**Why this priority**: El alta indivisible y el contexto inequívoco del negocio establecen la frontera de aislamiento para todas las capacidades posteriores; este slice técnico no habilita ventas por sí solo.

**Independent Test**: Puede probarse enviando desde el contrato de `komanda-business` dos solicitudes válidas para negocios diferentes y verificando que Core crea espacios completos e independientes, permite verificar las identidades y recorrer onboarding/readiness, devuelve un handoff utilizable, mantiene ventas deshabilitadas y nunca comparte datos entre propietarias.

**Acceptance Scenarios**:

1. **Given** una solicitud versionada de `komanda-business` con `plan_id` y datos válidos para una persona y negocio nuevos, **When** Core la procesa, **Then** crea en una única operación su cuenta, el tenant, una sede inicial, la membresía propietaria, el snapshot de entitlements y el estado de acceso, y devuelve el handoff al onboarding.
2. **Given** una solicitud autorizada para una persona ya existente, **When** `komanda-business` registra otro negocio con un identificador público disponible, **Then** Core agrega el tenant a sus contextos autorizados sin duplicar la identidad ni mezclar datos.
3. **Given** un identificador público ya utilizado, incluso con diferencias de mayúsculas, espacios o variantes equivalentes, **When** se intenta reservar nuevamente, **Then** el alta se rechaza y no quedan entidades parciales.
4. **Given** un fallo en cualquier paso del aprovisionamiento, **When** Core rechaza o revierte la solicitud, **Then** `komanda-business` recibe un resultado accionable y no queda una cuenta, sede, negocio o membresía incompleta.
5. **Given** un negocio sin todos los prerrequisitos operativos, **When** la propietaria intenta activar ventas, **Then** la activación se bloquea y el dashboard muestra las condiciones concretas pendientes.
6. **Given** una propietaria vinculada a varios negocios, **When** cambia el negocio activo, **Then** todo el dashboard adopta el contexto autorizado elegido y deja de mostrar datos del contexto anterior.
7. **Given** una solicitud con `plan_id` desconocido, inactivo o no aceptado por Core, **When** se intenta aprovisionar el negocio, **Then** la operación completa se rechaza sin crear entidades parciales y `komanda-business` recibe un código de error accionable.
8. **Given** una propietaria aprovisionada con identidad pendiente, **When** completa en la experiencia de `komanda-business` el desafío emitido por Core, **Then** Core valida el token de un solo uso, marca la identidad como verificada y permite continuar el onboarding sin que el cliente externo pueda alterar ese estado directamente.
9. **Given** un entorno no productivo donde `komanda-business` aún no está disponible, **When** se ejecuta el bootstrap mock, **Then** la fixture solicita por el contrato versionado la creación idempotente de un único tenant de desarrollo y la operación atraviesa las mismas validaciones, transacción y restricciones que una solicitud externa; el mismo mecanismo se rechaza en producción.

---

### User Story 2 - Administrar el catálogo propio (Priority: P1)

La propietaria crea, modifica, organiza, pausa y retira categorías, ítems de menú, grupos de adicionales y combos desde el dashboard de su negocio, sin depender de asistencia externa ni afectar otros catálogos.

**Why this priority**: Cada negocio necesita controlar su oferta para operar de forma autónoma y sustituir el catálogo central del sistema actual.

**Independent Test**: Puede probarse creando catálogos diferentes en dos negocios, publicando cambios en uno y verificando que solo su tienda refleja esos cambios.

**Acceptance Scenarios**:

1. **Given** un negocio sin catálogo, **When** la propietaria crea y habilita una categoría y un ítem válidos, **Then** el ítem aparece únicamente en la tienda de ese negocio con sus datos y disponibilidad correctos.
2. **Given** un ítem existente, **When** la propietaria agrega un grupo de adicionales con opciones, precios, mínimos y máximos válidos, **Then** los clientes solo pueden elegir combinaciones permitidas y ven el total actualizado.
3. **Given** ítems habilitados, **When** la propietaria crea un combo con composición, cantidades y precio propios, **Then** puede publicarlo sin alterar los precios individuales de sus componentes.
4. **Given** un ítem utilizado por un combo o por pedidos históricos, **When** se intenta retirarlo, **Then** el historial se preserva y ningún combo permanece publicado en estado inválido.
5. **Given** un identificador de catálogo perteneciente a otro negocio, **When** se intenta leer o modificar desde el contexto actual, **Then** la operación se deniega sin revelar el contenido ajeno.
6. **Given** dos propietarias editando el mismo elemento, **When** una intenta guardar sobre una versión más reciente, **Then** el sistema evita una sobrescritura silenciosa e informa el conflicto.

---

### User Story 3 - Comprar en la tienda del negocio correcto (Priority: P1)

Un cliente accede a la presencia pública de un negocio, consulta su catálogo disponible, arma un carrito y completa el checkout sin ver ni utilizar información de otro tenant.

**Why this priority**: La tienda y el checkout son el flujo comercial principal; una confusión de tenant altera catálogo, importes, cobros, pedidos y confianza.

**Independent Test**: Puede probarse con dos negocios activos y ofertas diferentes, creando un carrito en cada uno y verificando que catálogo, selecciones, pago y pedido permanecen asociados al negocio de origen.

**Acceptance Scenarios**:

1. **Given** dos negocios activos con catálogos distintos, **When** un cliente accede al identificador público de cada uno, **Then** ve únicamente la identidad y oferta del negocio solicitado.
2. **Given** un carrito creado en A, **When** se intenta abrir o pagar desde el contexto de B, **Then** la operación se rechaza sin revelar el contenido del carrito.
3. **Given** un identificador inexistente, ambiguo o perteneciente a un negocio no disponible, **When** un cliente intenta acceder, **Then** se muestra un estado de negocio no disponible y nunca se selecciona otro tenant como alternativa.
4. **Given** un carrito armado antes de un cambio de precio, composición o disponibilidad, **When** el cliente intenta pagar, **Then** el carrito se revalida y cualquier diferencia requiere su confirmación.
5. **Given** un carrito válido, **When** el cliente confirma sus datos y paga, **Then** el intento de cobro y el pedido resultante pertenecen al mismo negocio y conservan el detalle validado.
6. **Given** un negocio suspendido, **When** un cliente intenta iniciar un carrito o checkout, **Then** la operación se bloquea antes de generar un nuevo intento de cobro.

---

### User Story 4 - Conectar cobros y configurar la operación por negocio (Priority: P1)

La propietaria mantiene la identidad y preferencias operativas de su negocio y conecta su propia cuenta vendedora de Mercado Pago mediante OAuth, con una indicación clara de autorización y preparación.

**Why this priority**: Cada tenant debe recibir sus propios fondos y no puede depender de credenciales globales o pertenecientes a otro comercio.

**Independent Test**: Puede probarse conectando mediante OAuth cuentas vendedoras diferentes en dos negocios, realizando un cobro de prueba en cada contexto y verificando que cada operación utiliza exclusivamente la cuenta autorizada correspondiente.

**Acceptance Scenarios**:

1. **Given** una propietaria autorizada, **When** completa OAuth con su cuenta vendedora, **Then** Core guarda los tokens de forma privada y el dashboard muestra únicamente el estado utilizable y datos no sensibles de la conexión.
2. **Given** una autorización OAuth incompleta, inválida, vencida o revocada, **When** se intenta habilitar el cobro en línea, **Then** la activación se bloquea con un mensaje accionable.
3. **Given** una autorización vigente, **When** la propietaria reconecta o revoca la cuenta, **Then** las nuevas ventas dejan de usar la autorización anterior y el cambio queda registrado.
4. **Given** un negocio sin configuración propia, **When** un cliente intenta pagar en línea, **Then** no se utilizan credenciales globales ni de otro negocio.
5. **Given** una notificación de pago sin un negocio y operación inequívocos, **When** se procesa, **Then** no modifica registros y queda disponible para revisión segura.
6. **Given** dos notificaciones equivalentes o fuera de orden, **When** se procesan, **Then** producen un único resultado efectivo y no duplican pedidos, cobros o impresiones.

---

### User Story 5 - Gestionar pedidos en curso (Priority: P1)

La propietaria consulta en tiempo oportuno los pedidos de su negocio, abre sus detalles, registra pedidos directos y ejecuta las transiciones operativas permitidas desde el dashboard.

**Why this priority**: El panel de pedidos es la herramienta diaria para transformar ventas confirmadas en entregas correctas.

**Independent Test**: Puede probarse generando y operando pedidos en dos negocios; cada lista, detalle, actualización, pedido directo y notificación debe permanecer en su negocio de origen.

**Acceptance Scenarios**:

1. **Given** pedidos activos en A y B, **When** la propietaria abre el panel de A, **Then** ve únicamente pedidos, pagos y estados operativos de A.
2. **Given** un pedido de A, **When** una propietaria autorizada ejecuta una transición válida, **Then** el nuevo estado se muestra solo en A y queda registrado con actor y momento.
3. **Given** una transición inválida o repetida, **When** se intenta aplicar, **Then** el estado no retrocede ni produce efectos duplicados y se muestra una explicación clara.
4. **Given** un carrito válido de A, **When** la propietaria registra un pedido directo, **Then** el pedido, el registro administrativo del pago y el trabajo de impresión pertenecen a A.
5. **Given** una interrupción de conectividad, **When** el dashboard se reconecta, **Then** recupera el estado vigente sin duplicar acciones ni mezclar eventos de otro negocio.
6. **Given** el identificador de un pedido de B dentro de una sesión de A, **When** se intenta consultar o modificar, **Then** la operación se deniega sin revelar si el pedido existe.

---

### User Story 6 - Imprimir tickets dentro del alcance autorizado (Priority: P2)

La propietaria habilita la impresión para su negocio y los agentes autorizados reciben y confirman únicamente tickets de la sede y tenant a los que pertenecen.

**Why this priority**: La impresión es un efecto físico; un error de alcance puede exponer datos de clientes o iniciar la preparación de un pedido ajeno.

**Independent Test**: Puede probarse con agentes de dos negocios, pedidos simultáneos y períodos de desconexión; cada agente debe recibir solo sus trabajos y reanudar los pendientes sin duplicados.

**Acceptance Scenarios**:

1. **Given** un pedido imprimible de A, **When** el agente autorizado de A solicita trabajo, **Then** recibe el ticket de A y nunca uno de B o de una sede no autorizada.
2. **Given** un agente desconectado, **When** se genera un ticket, **Then** el trabajo queda pendiente y puede procesarse al recuperar conexión sin perder el pedido.
3. **Given** un reintento o confirmación repetida, **When** el agente informa el resultado, **Then** el trabajo conserva un único resultado efectivo y un historial trazable.
4. **Given** un fallo permanente de impresión, **When** se agotan los reintentos permitidos, **Then** el dashboard informa el problema sin revertir el pago ni modificar el pedido.

---

### User Story 7 - Migrar el negocio actual y retirar Strapi (Priority: P2)

El negocio que hoy utiliza Komanda continúa operando como tenant inicial, con catálogo, acceso, configuración y registros preservados, mientras Strapi deja de ser una dependencia operativa.

**Why this priority**: La expansión no puede sacrificar al negocio actual ni mantener dos fuentes de verdad que diverjan después del corte.

**Independent Test**: Puede probarse migrando una copia representativa, conciliando catálogo y datos operativos, y ejecutando los recorridos críticos con Strapi indisponible después del corte.

**Acceptance Scenarios**:

1. **Given** el catálogo y los datos operativos actuales, **When** se ejecuta la migración, **Then** categorías, ítems, combos, imágenes disponibles, carritos, pagos, pedidos, trabajos de impresión, configuraciones y acceso administrativo quedan asignados al tenant inicial con sus relaciones preservadas.
2. **Given** registros huérfanos, duplicados o relaciones inválidas, **When** se valida la migración, **Then** el corte se bloquea y cada diferencia aparece en un reporte accionable.
3. **Given** una migración conciliada, **When** se realiza el corte, **Then** la tienda, el dashboard, los pagos y la impresión operan sin consultar Strapi.
4. **Given** un fallo durante el corte, **When** no se cumplen las condiciones de aceptación, **Then** se puede volver al estado operativo anterior sin aceptar escrituras divergentes en dos fuentes.
5. **Given** una migración satisfactoria, **When** la propietaria actual ingresa y recorre los flujos críticos, **Then** conserva su acceso y el negocio continúa operando sin pérdida de datos.

### Edge Cases

- Dos registros simultáneos intentan reservar el mismo identificador público con distinta capitalización, espacios o caracteres equivalentes.
- Una cuenta pertenece a varios negocios y conserva pestañas o acciones pendientes del contexto anterior.
- Una migración funciona en Neon development pero falla en Azure staging por diferencias de roles, extensiones, parámetros, red o límites de conexión.
- Una configuración o estado de infraestructura intenta apuntar development a recursos Azure productivos, o staging/production a un proyecto Neon.
- Un backup productivo no puede restaurarse dentro del tiempo objetivo o intenta usarse como fixture de desarrollo.
- Un cliente cambia de negocio con un carrito persistido o reutiliza un enlace de checkout anterior.
- Dos propietarias editan simultáneamente el mismo ítem, combo o configuración.
- Se intenta retirar una categoría con ítems, un ítem usado en combos o una opción usada por carritos y pedidos históricos.
- Un combo queda sin componentes disponibles o un grupo de adicionales queda con reglas imposibles de cumplir.
- Un proceso interno, actualización en vivo, limpieza o reintento se ejecuta sin un contexto de negocio explícito.
- Las credenciales de Mercado Pago vencen, se revocan durante un pago o pertenecen a una cuenta distinta de la esperada.
- Una notificación de pago llega repetida, fuera de orden, sin tenant verificable o con referencias cruzadas.
- Un negocio se suspende mientras existen carritos, pagos o trabajos de impresión en curso.
- Un agente válido intenta reclamar o actualizar un trabajo de otra sede o negocio.
- Dos negocios generan el mismo número visible, referencia externa o clave de idempotencia dentro de sus cuentas separadas.
- La migración encuentra imágenes inaccesibles, relaciones rotas, contenido inválido o configuraciones globales que no pueden asignarse de forma segura.
- El tenant inicial debe conservar acceso durante la transición sin convertirse en alternativa implícita para solicitudes ambiguas nuevas.
- El cliente de adquisición, Strapi, Mercado Pago o el agente de impresión quedan indisponibles en distintas etapas de la migración y de la operación normal.

## Requirements *(mandatory)*

### Scope Boundaries

**Included**:

- Contrato versionado mediante el cual `komanda-business` envía un `plan_id` y solicita el aprovisionamiento indivisible de cuenta, tenant, sede inicial, membresía propietaria, snapshot de entitlements y acceso operacional.
- Fixture temporal no productiva para crear un tenant mock mediante el mismo contrato y servicio de aprovisionamiento de Core.
- Selección segura del tenant y aislamiento de experiencias públicas, administrativas, integraciones y procesos en segundo plano.
- Administración autoservicio de categorías, ítems, grupos de adicionales, opciones y combos.
- Tienda, carrito, checkout y creación de pedidos dentro del negocio resuelto.
- Configuración propia de identidad operativa, conexión OAuth de Mercado Pago e impresión.
- Consulta, creación directa y actualización de pedidos desde el dashboard.
- Procesamiento y seguimiento de pagos y tickets de impresión dentro del negocio y sede autorizados.
- Migración del catálogo de Strapi y de los datos operativos actuales hacia un tenant inicial, con conciliación, corte, reversión y retiro de la dependencia operativa.
- Contratos versionados y reutilizables para clientes web, integraciones y futuros clientes.

**Excluded**:

- Implementación del formulario público de registro, contenido de adquisición, presentación y selección comercial de planes y analítica de marketing; estas capacidades pertenecen a `komanda-business`.
- Suscripciones, facturación de Komanda, medición de consumo y motores de cuotas comerciales; esta versión solo aplica flags operacionales mínimos resueltos por Core.
- Roles granulares, invitaciones y permisos adicionales a la propietaria inicial.
- Gestión completa de múltiples sedes; este alcance crea y utiliza una sede inicial.
- Dominios personalizados, constructor de página pública y personalización visual avanzada.
- Inventario, recetas, costos internos, compras a proveedores y control de stock.
- Proveedores de pago distintos de Mercado Pago.
- Ingreso manual, importación o administración de API keys o access tokens de Mercado Pago para operación multi-tenant normal.
- Analítica avanzada, contabilidad, facturación fiscal, liquidaciones y conciliación bancaria.
- Administración global, backoffice de planes, exportación o eliminación autoservicio de un tenant.
- Seeds o endpoints mock habilitados en producción, escritura directa de datos mock en la base o selección implícita del tenant mock como fallback.

### Functional Requirements

- **FR-001**: Core DEBE aceptar de `komanda-business` una solicitud de aprovisionamiento versionada que incluya como mínimo un `plan_id` estable, nombre e identificador público del negocio y datos de registro de la propietaria; Core DEBE crear la identidad como pendiente, emitir una verificación de un solo uso y ser la única autoridad que puede marcarla como verificada. Hasta que el consumidor externo esté funcional, una fixture disponible únicamente en desarrollo/pruebas PUEDE enviar el mismo payload por el mismo contrato y servicio, pero NO DEBE escribir directamente en la base ni ejecutarse en producción.
- **FR-002**: El alta DEBE crear de forma indivisible la cuenta cuando corresponda, el negocio, una sede inicial, la membresía propietaria y el snapshot de entitlements; si una parte falla, ninguna entidad parcial debe quedar activa.
- **FR-003**: Core DEBE permitir que una solicitud autorizada iniciada por `komanda-business` registre negocios adicionales para una persona existente sin duplicar su identidad de plataforma.
- **FR-004**: El identificador público DEBE ser único después de normalizar mayúsculas, espacios y variantes equivalentes, incluso ante intentos concurrentes.
- **FR-005**: Cada negocio DEBE tener un estado explícito de onboarding, activo o suspendido; solo un negocio activo puede iniciar operaciones públicas nuevas.
- **FR-006**: Una persona con varias membresías DEBE poder cambiar el negocio activo únicamente entre contextos autorizados y DEBE ver una indicación persistente del contexto seleccionado.
- **FR-007**: Toda solicitud pública o protegida, integración, notificación externa, trabajo y proceso interno DEBE resolver exactamente un negocio antes de acceder a datos tenant-aware.
- **FR-008**: Un contexto inexistente, ambiguo, suspendido o no autorizado DEBE fallar de forma segura y NO DEBE usar un tenant inicial, global o alternativo como fallback.
- **FR-009**: Cada acción protegida DEBE verificar en el servidor que la identidad mantiene una membresía vigente con el negocio resuelto, independientemente de identificadores enviados por el cliente.
- **FR-010**: Sedes, catálogo, carritos, intentos de pago, pedidos, trabajos de impresión, configuraciones, credenciales y membresías DEBEN tener un único negocio propietario identificable.
- **FR-011**: Toda lectura, listado, creación, modificación y retiro de datos propios de un tenant DEBE limitarse al negocio resuelto, incluso si se proporciona un identificador válido de otro tenant.
- **FR-012**: El sistema DEBE rechazar relaciones entre entidades que pertenezcan a negocios diferentes y NO DEBE permitir reasignar registros operativos entre tenants mediante flujos normales.
- **FR-013**: Procesos en segundo plano, reintentos, limpiezas y actualizaciones en vivo DEBEN conservar el contexto del negocio y rechazar cualquier contexto ausente o contradictorio.
- **FR-014**: La experiencia pública DEBE mostrar únicamente identidad y catálogo del negocio resuelto y DEBE permitir comprar sin exigir una cuenta de cliente.
- **FR-015**: Cada carrito DEBE pertenecer al negocio donde se creó; al cambiar de tenant debe separarse o invalidarse y nunca reutilizarse en otro checkout.
- **FR-016**: Antes del pago, el carrito DEBE revalidarse contra precio, disponibilidad, composición y reglas vigentes; cualquier cambio que afecte al cliente debe requerir su confirmación.
- **FR-017**: El intento de pago y el pedido resultante DEBEN pertenecer al mismo negocio que el carrito validado.
- **FR-018**: El pedido confirmado DEBE conservar una representación inmutable de líneas, nombres, selecciones, cantidades, precios, moneda, cliente y notas aceptados al momento de compra.
- **FR-019**: El sistema DEBE permitir crear, consultar, modificar, ordenar, habilitar, deshabilitar y retirar categorías del negocio activo.
- **FR-020**: El sistema DEBE permitir crear, consultar, modificar, habilitar, deshabilitar y retirar ítems con nombre, descripción opcional, precio válido, imagen opcional, categoría y disponibilidad.
- **FR-021**: El sistema DEBE permitir definir grupos de adicionales con opciones, ajustes de precio, cantidades mínima y máxima y condición obligatoria u opcional, rechazando reglas inconsistentes.
- **FR-022**: El sistema DEBE permitir crear, modificar, habilitar, deshabilitar y retirar combos con nombre, descripción opcional, imagen opcional, composición, cantidades y precio total propios.
- **FR-023**: Un elemento de catálogo solo DEBE publicarse cuando sus datos obligatorios y relaciones sean válidos y pertenezcan al mismo negocio.
- **FR-024**: Retirar o modificar catálogo DEBE preservar pedidos históricos y NO DEBE dejar combos publicados o reglas de adicionales en estado inválido.
- **FR-025**: El dashboard DEBE impedir que ediciones concurrentes sobrescriban silenciosamente versiones más recientes de catálogo o configuración.
- **FR-026**: El sistema DEBE permitir mantener por negocio identidad visible, contacto, moneda, estado de ventas y preferencias de pedidos, cobro e impresión incluidas en este alcance.
- **FR-027**: Solo una propietaria autorizada DEBE poder iniciar, completar, verificar, reconectar o revocar OAuth de Mercado Pago para su negocio; Core NO DEBE ofrecer ingreso manual de API keys o access tokens como flujo operacional.
- **FR-028**: Los secretos guardados NO DEBEN volver a mostrarse completos ni aparecer en pantallas, mensajes, exportaciones, diagnósticos o respuestas destinadas a clientes.
- **FR-029**: Las credenciales DEBEN tener un estado verificable y el negocio NO DEBE habilitar cobros en línea mientras sean incompletas, inválidas o estén revocadas.
- **FR-030**: Todo cobro DEBE utilizar exclusivamente la configuración vigente del negocio propietario del carrito y NO DEBE usar credenciales globales o ajenas como alternativa.
- **FR-031**: Las notificaciones de pago DEBEN validar de forma inequívoca el negocio, intento y pedido antes de modificar estados; repeticiones y eventos fuera de orden DEBEN producir un único resultado efectivo.
- **FR-032**: Una indisponibilidad o reintento del proveedor de pagos NO DEBE crear cobros o pedidos duplicados y DEBE producir un estado seguro y accionable.
- **FR-033**: El dashboard DEBE listar exclusivamente pedidos del negocio activo, diferenciarlos por estado y permitir abrir su detalle con identificador, momento, cliente, líneas, importes, pago e impresión.
- **FR-034**: El sistema DEBE permitir únicamente transiciones de pedido válidas, evitar efectos duplicados y registrar actor, momento, estado anterior y estado resultante.
- **FR-035**: Los pedidos directos creados desde el dashboard DEBEN asociar pedido, registro administrativo de pago e impresión al negocio y sede activos.
- **FR-036**: Los cambios relevantes de pedidos DEBEN aparecer en el panel correcto en tiempo oportuno y una reconexión DEBE recuperar el estado autoritativo sin duplicar acciones.
- **FR-037**: Cada configuración, agente y trabajo de impresión DEBE pertenecer a un negocio y una sede explícitos.
- **FR-038**: Un agente solo DEBE poder reclamar, consultar o confirmar trabajos dentro de su alcance autorizado; un intento cruzado debe denegarse sin revelar contenido.
- **FR-039**: Los trabajos de impresión DEBEN conservar estado, intentos y resultado; una interrupción temporal DEBE mantenerlos pendientes y permitir reanudarlos sin una segunda entrega efectiva.
- **FR-040**: Un fallo de impresión NO DEBE revertir un pago ni modificar negocio, estado comercial o contenido del pedido, y DEBE informar una acción posible a la propietaria.
- **FR-041**: El onboarding DEBE mostrar los prerrequisitos pendientes e impedir la activación hasta contar como mínimo con una identidad verificada por Core, identificador público, sede inicial, moneda, un ítem publicable y una modalidad de cobro propia habilitada; la impresión solo es obligatoria si el negocio decide usarla.
- **FR-042**: Al suspender un negocio, el sistema DEBE bloquear nuevas ventas y cambios publicados, mantener el historial disponible para propietarias autorizadas y permitir conciliar pagos y completar pedidos ya iniciados sin reabrir ventas.
- **FR-043**: La migración DEBE crear un tenant inicial y asignarle catálogo, carritos, pagos, pedidos, impresiones, configuraciones y accesos administrativos actuales.
- **FR-044**: La migración DEBE preservar identificadores necesarios, fechas, estados, importes, relaciones, imágenes disponibles y acceso de la propietaria existente.
- **FR-045**: Antes del corte, la migración DEBE conciliar conteos y relaciones de categorías, ítems, combos, configuraciones, carritos, pagos, pedidos e impresiones e identificar registros omitidos, duplicados o inválidos.
- **FR-046**: El corte DEBE bloquearse mientras exista una diferencia no aceptada y DEBE contar con un procedimiento comprobado de reversión que evite escrituras divergentes.
- **FR-047**: Después de un corte aceptado, la tienda, el dashboard, los pagos y la impresión NO DEBEN depender de Strapi ni mantener una segunda fuente autoritativa de catálogo.
- **FR-048**: Las operaciones sensibles DEBEN registrar negocio, actor o proceso, acción, resultado y momento para altas, cambios de contexto, catálogo, credenciales, pedidos, impresión, denegaciones y migración.
- **FR-049**: Los datos de clientes, credenciales y detalles de integraciones NO DEBEN exponerse en respuestas, errores, diagnósticos o eventos destinados a otro negocio.
- **FR-050**: Las reglas de numeración, referencias externas, duplicados e idempotencia DEBEN incorporar el contexto del negocio cuando un valor pueda repetirse legítimamente entre tenants.
- **FR-051**: Los contratos cambiados DEBEN ser documentados, versionados y compatibles con consumidores existentes durante una ventana de transición definida.
- **FR-052**: Aprovisionamiento, autenticación, catálogo, carrito, checkout, configuración, pedidos, pagos e impresión DEBEN poder ser consumidos por futuros clientes sin exigir componentes, cookies o acciones exclusivas de la interfaz web actual.
- **FR-053**: La indisponibilidad del cliente de adquisición, Mercado Pago o impresión DEBE limitarse a la capacidad afectada y NO DEBE impedir operar capacidades de Core que no dependan de ella.
- **FR-054**: `komanda-business` DEBE interactuar con Core únicamente mediante contratos versionados y NO DEBE acceder a su base de datos ni persistir copias autoritativas de usuarios, tenants, membresías o configuración operacional.
- **FR-055**: Core DEBE mantener definiciones de plan versionadas, revisables y desplegadas junto con sus releases, validar el `plan_id` contra la versión activa, rechazar identificadores desconocidos o inactivos, persistir un snapshot versionado e inmutable y aplicar en los servicios correspondientes los flags `catalog_management`, `online_payments` y `printing`; una capacidad opcional ausente, desconocida o deshabilitada DEBE denegarse de forma cerrada.
- **FR-056**: Cada ambiente DEBE usar una base, credenciales y estado de infraestructura independientes; ninguna configuración de development, staging o producción PUEDE resolver silenciosamente recursos pertenecientes a otro ambiente.
- **FR-057**: Neon DEBE limitarse a development remoto y NO DEBE recibir credenciales, backups ni datos identificables de staging o producción.
- **FR-058**: Staging DEBE usar el mismo servicio de base administrada, versión mayor, migraciones, extensiones requeridas, modelo de roles y políticas de aislamiento que producción antes de aprobar una release.
- **FR-059**: Toda migración de esquema o permisos DEBE ejecutarse desde cero y como actualización sobre PostgreSQL efímero, Neon development y Azure staging; una diferencia no aceptada DEBE bloquear la promoción a producción.
- **FR-060**: Producción DEBE contar con alta disponibilidad administrada, backups con restauración a un punto en el tiempo, protección contra eliminación accidental y un procedimiento de restore ensayado fuera de producción.
- **FR-061**: La aplicación DEBE usar capacidades PostgreSQL portables o aislar explícitamente cualquier comportamiento específico del proveedor; ninguna regla de negocio, aislamiento o migración PUEDE depender exclusivamente de Neon.

### Key Entities

- **Negocio (Tenant)**: frontera principal de propiedad y aislamiento; incluye identidad, identificador público normalizado, estado y preparación operativa.
- **Sede**: punto operativo de un negocio. El alta crea una sede inicial para asociar pedidos e impresión.
- **Usuario de plataforma**: identidad global de una persona que puede pertenecer a uno o más negocios sin duplicarse; Core conserva su estado pendiente/verificado y los desafíos de verificación de un solo uso.
- **Membresía**: relación entre usuario y negocio que determina acceso vigente y, en este alcance, condición de propietaria.
- **Definición de plan**: registro global versionado y desplegado por Core que relaciona un `plan_id` estable con estado y flags operacionales aceptados; no contiene contenido comercial.
- **Snapshot de entitlements**: copia versionada e inmutable de los flags operacionales mínimos resueltos por Core desde el `plan_id` aceptado; en esta versión controla administración de catálogo, cobros en línea e impresión.
- **Contexto de negocio**: tenant inequívocamente resuelto para una interacción, integración o proceso; determina datos y acciones permitidos.
- **Categoría**: agrupación ordenable de la oferta de un único negocio.
- **Ítem de menú**: producto vendible con identidad, precio, categoría, imagen y disponibilidad.
- **Grupo de adicionales**: conjunto de opciones y reglas de selección aplicables a ítems del mismo negocio.
- **Opción adicional**: elección individual con nombre, ajuste de precio y disponibilidad.
- **Combo**: oferta compuesta por ítems y cantidades del mismo tenant, con identidad, precio y disponibilidad propios.
- **Carrito temporal**: selección validada de un cliente, perteneciente a un negocio, con líneas, importes, moneda y vencimiento.
- **Configuración operativa**: identidad, preferencias y referencias privadas de integraciones pertenecientes a un negocio; Mercado Pago se representa mediante una autorización OAuth de cuenta vendedora.
- **Intento de pago**: seguimiento de un cobro ligado a un carrito y tenant, con referencia externa, estado e idempotencia.
- **Pedido**: operación comercial perteneciente a un negocio, con cliente, estados, importes y detalle histórico inmutable.
- **Agente de impresión**: identidad autorizada para reclamar trabajos de un negocio y sede determinados.
- **Trabajo de impresión**: instrucción asociada a pedido, negocio y sede, con estado, intentos y resultado.
- **Reporte de conciliación**: evidencia que compara origen y destino de la migración, registra diferencias y habilita o bloquea el corte.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Al menos el 99% de las solicitudes válidas enviadas por `komanda-business` —o por la fixture contractual equivalente mientras el consumidor no esté disponible— crea exactamente una cuenta pendiente o reutiliza la identidad existente, un tenant, una sede inicial, una membresía propietaria y un snapshot de entitlements completos, y entrega en menos de 5 segundos un handoff utilizable hacia la verificación administrada por Core y el onboarding.
- **SC-002**: Al menos el 85% de propietarias crea y publica sin asistencia una categoría, un ítem con adicionales y un combo válido en menos de 12 minutos durante su primer intento.
- **SC-003**: El 100% de una matriz con al menos dos negocios bloquea lecturas, escrituras, relaciones, carritos, pagos, eventos, credenciales, actualizaciones y trabajos de impresión cruzados.
- **SC-004**: El 100% de solicitudes de aceptación con tenant inexistente, ambiguo o no autorizado termina sin mostrar ni modificar datos ajenos y sin seleccionar un tenant por defecto.
- **SC-005**: Los recorridos de registro, selección de negocio, catálogo, carrito, checkout, pago, pedido, panel, pedido directo e impresión se completan de punta a punta para dos negocios y cada resultado aparece solo en su espacio.
- **SC-006**: Al menos el 95% de los cambios de estado de pedido aparece en el panel correcto dentro de 5 segundos en condiciones normales y el 100% se recupera correctamente después de una reconexión controlada.
- **SC-007**: El 100% de cobros de aceptación utiliza la cuenta configurada por el negocio de origen y ninguna prueba utiliza credenciales globales, revocadas o ajenas.
- **SC-008**: El 100% de secretos inspeccionados en pantallas, mensajes, exportaciones y diagnósticos permanece oculto; ninguna credencial completa vuelve a mostrarse después de guardarla.
- **SC-009**: El 100% del catálogo y los registros operativos actuales queda asignado y conciliado con el tenant inicial antes del corte; no existen diferencias no aceptadas ni registros huérfanos.
- **SC-010**: Durante un piloto de 7 días posterior al corte, tienda, dashboard, pagos e impresión completan el 100% de sus recorridos de aceptación sin depender del catálogo legado.
- **SC-011**: El 100% de trabajos creados durante una desconexión controlada de impresión permanece recuperable y se procesa una sola vez al restablecerse el servicio.
- **SC-012**: Con al menos 100 negocios registrados y 50 operadores simultáneos en una prueba representativa, al menos el 95% de las vistas de tienda, catálogo y pedidos muestra información útil en menos de 2 segundos.
- **SC-013**: Al menos el 85% de las propietarias participantes califica como clara la administración de catálogo, cobros y pedidos y completa las tareas principales en el primer intento.
- **SC-014**: El tenant inicial supera el 100% de las pruebas de regresión acordadas para tienda, checkout, pagos, pedidos, panel e impresión sin pérdida de datos.
- **SC-015**: El 100% de las pruebas con `plan_id` desconocido o inactivo se rechaza sin entidades parciales; todo tenant aprovisionado conserva el snapshot resuelto por Core y el 100% de intentos de usar `catalog_management`, `online_payments` o `printing` sin el flag habilitado se deniega sin efectos parciales.
- **SC-016**: El 100% de las migraciones y pruebas de aislamiento obligatorias produce resultados equivalentes en PostgreSQL efímero, Neon development y Azure staging antes de una promoción productiva.
- **SC-017**: Ninguna inspección automatizada de Neon development encuentra credenciales, backups o datos identificables originados en staging o producción.
- **SC-018**: Antes del primer tenant productivo se completa al menos un restore íntegro de Azure staging, se verifican conteos e invariantes y se registra el tiempo real de recuperación.

## Assumptions

### Dependencies

- El negocio actual y sus datos pueden identificarse de forma inequívoca como el tenant inicial antes del corte.
- `komanda-business` implementa con Astro la experiencia pública de adquisición, selección de plan y formulario de registro, y consume el contrato versionado de Core sin compartir su base de datos.
- Hasta que `komanda-business` esté funcional, el desarrollo manual usa un único tenant mock idempotente creado por una fixture contractual no productiva; la suite de aislamiento conserva al menos dos tenants A/B y no depende de ese único tenant.
- Core genera y valida los desafíos de verificación de identidad; `komanda-business` solo presenta la experiencia y retransmite el resultado mediante el contrato versionado, sin persistir autoridad de verificación.
- `komanda-business` y Core coordinan identificadores de plan estables mediante un contrato versionado; la presentación comercial vive en `komanda-business`, mientras la resolución y aplicación de entitlements vive en Core.
- Las altas o modificaciones de una definición de plan se despliegan mediante cambios versionados y revisables de Core antes de que `komanda-business` pueda enviar ese `plan_id`; no existe sincronización automática ni backoffice de planes en este alcance.
- Existe acceso de lectura suficiente al catálogo, relaciones y recursos de Strapi para migrarlos y conciliarlos.
- Mercado Pago y los agentes de impresión continúan ofreciendo mecanismos para validar credenciales, correlacionar operaciones y reintentar efectos externos.
- El tenant inicial completará OAuth y validará su cuenta vendedora antes del cutover de pagos; su token global actual no se importará como credencial operacional del nuevo modelo.
- `komanda-business` inicia el aprovisionamiento mediante un contrato versionado; Core valida la solicitud y el `plan_id`, y crea de forma indivisible cuenta, tenant, sede, membresía, snapshot de entitlements y estado de acceso.
- La organización dispone de una suscripción Azure y permisos para crear redes privadas, Azure PostgreSQL y almacenamiento de estado separados para staging y producción.

### Working Assumptions

- Un tenant representa un negocio jurídicamente u operativamente independiente; una identidad personal puede administrar varios mediante membresías separadas.
- La primera versión concede las capacidades administrativas de este alcance únicamente a la propietaria; colaboradores y permisos granulares se especificarán por separado.
- El primer MVP técnico termina con provisioning, verificación de identidad, aislamiento, selección de tenant y onboarding/readiness; no incluye activación de ventas. La activación se habilita en un hito posterior cuando catálogo publicable y OAuth de Mercado Pago estén implementados.
- Cada negocio opera inicialmente con una sede; la administración de sedes adicionales queda fuera de alcance.
- Los cambios publicados de catálogo afectan nuevas selecciones; los carritos pendientes se revalidan y los pedidos confirmados conservan su detalle histórico.
- Retirar un elemento usado históricamente lo oculta de nuevas ventas sin borrar evidencia de pedidos anteriores.
- El precio de un combo es propio y no se recalcula automáticamente como suma de sus componentes.
- La moneda y la modalidad de cobro se definen por negocio. La impresión es opcional y solo se convierte en prerrequisito cuando la propietaria la habilita.
- La ruta, subdominio o dominio usado para identificar públicamente un tenant se decidirá durante el diseño sin cambiar la exigencia de resolución inequívoca.
- La migración se ensayará sobre una copia representativa y el origen permanecerá controlado durante el corte para evitar escrituras divergentes.
- Planes, facturación de plataforma, dominios personalizados, inventario, fiscalidad, analítica avanzada, administración global y operación multi-sede se abordarán en features independientes.
- Los flags operacionales iniciales son `catalog_management`, `online_payments` y `printing`; agregar cuotas, consumos o nuevas capacidades requiere una evolución versionada del contrato y del evaluador de Core.
- Neon development, Azure staging y Azure production conservan la misma versión mayor de PostgreSQL; las diferencias deliberadas de capacidad o disponibilidad no alteran schema, RLS ni contratos.
- Staging puede usar menor capacidad y omitir alta disponibilidad para controlar costos, pero debe conservar la misma topología de acceso privado, roles, migraciones y extensiones de producción.
