# Feature Specification: Base multi-tenant

**Feature Branch**: `main` *(no se creó una rama de feature; no hay hook `before_specify` configurado)*

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "Actualmente el proyecto está pensado para una sola empresa. La idea es migrar el funcionamiento actual, sin incluir la parte de Strapi porque se eliminará, a una base multi-tenant para que nuevos negocios se puedan registrar y tengan un funcionamiento individual."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar un negocio aislado (Priority: P1)

Una persona crea su cuenta y registra un negocio con identidad pública propia. Al finalizar obtiene acceso como propietaria a un espacio de trabajo separado y puede ver qué configuración falta antes de habilitar la operación pública.

**Why this priority**: Sin alta autoservicio y propiedad inequívoca no es posible incorporar nuevos negocios ni establecer la frontera de aislamiento.

**Independent Test**: Puede probarse registrando dos negocios desde cuentas diferentes y verificando que cada propietario entra únicamente a su espacio, con una sede inicial y un estado de preparación independientes.

**Acceptance Scenarios**:

1. **Given** una persona sin cuenta y datos válidos para un negocio nuevo, **When** completa el registro, **Then** se crean su cuenta, el negocio, una sede inicial y su vínculo como propietaria en una única operación, y accede al onboarding del negocio.
2. **Given** una persona ya autenticada, **When** registra otro negocio con un identificador público disponible, **Then** el nuevo negocio se agrega a sus espacios autorizados sin mezclar datos con los anteriores.
3. **Given** un identificador público ya utilizado, incluso con diferencias de mayúsculas o espacios, **When** se intenta registrar otro negocio con ese identificador, **Then** el registro se rechaza y no quedan cuentas, sedes ni vínculos incompletos.
4. **Given** un fallo en cualquier paso del alta, **When** el proceso termina con error, **Then** el usuario recibe una explicación accionable y no queda un negocio parcialmente creado.
5. **Given** un negocio en onboarding al que le faltan prerrequisitos operativos, **When** la propietaria intenta activarlo, **Then** la activación se impide y se presenta la lista concreta de condiciones pendientes.

---

### User Story 2 - Atender clientes en el negocio correcto (Priority: P1)

Un cliente accede a la presencia pública de un negocio, consulta su oferta disponible, arma un carrito y avanza al checkout sin ver ni usar información de otro negocio.

**Why this priority**: La tienda pública y el checkout son el flujo comercial principal; una confusión de negocio afecta precios, cobros, pedidos y confianza.

**Independent Test**: Puede probarse con dos negocios activos y ofertas distintas, realizando un carrito en cada uno y verificando que productos, importes, cliente, pago y pedido permanecen asociados al negocio de origen.

**Acceptance Scenarios**:

1. **Given** dos negocios activos con contenido operativo diferente, **When** un cliente accede al identificador público de cada uno, **Then** ve únicamente la identidad y oferta del negocio solicitado.
2. **Given** un carrito creado en el negocio A, **When** se intenta abrirlo o pagarlo desde el contexto del negocio B, **Then** la operación se rechaza sin revelar el contenido del carrito.
3. **Given** un identificador inexistente, ambiguo o perteneciente a un negocio no disponible públicamente, **When** un cliente intenta acceder, **Then** se muestra un estado de negocio no disponible y nunca se usa otro negocio como alternativa.
4. **Given** un carrito válido de un negocio activo, **When** el cliente confirma sus datos y paga, **Then** el intento de cobro y el pedido resultante pertenecen al mismo negocio y conservan el detalle validado del carrito.
5. **Given** un negocio suspendido, **When** un cliente intenta iniciar un carrito o checkout nuevo, **Then** la operación se bloquea antes de generar un intento de cobro.

---

### User Story 3 - Operar un negocio desde su panel (Priority: P1)

La persona propietaria ingresa al panel de un negocio para consultar pedidos en vivo, registrar pedidos directos y marcar entregas, siempre dentro del negocio seleccionado.

**Why this priority**: La operación diaria existente debe seguir funcionando para más de un negocio sin exponer ventas ni clientes entre competidores.

**Independent Test**: Puede probarse creando pedidos en dos negocios y ejecutando las acciones administrativas actuales desde cada panel; las listas, actualizaciones y pedidos directos solo deben afectar al negocio seleccionado.

**Acceptance Scenarios**:

1. **Given** una propietaria con acceso a los negocios A y B, **When** selecciona A y abre el panel, **Then** solo ve pedidos, pagos y estados operativos de A.
2. **Given** una sesión válida para A y el identificador conocido de un pedido de B, **When** intenta consultarlo o modificarlo, **Then** la operación se deniega como recurso no encontrado y no revela datos de B.
3. **Given** un carrito válido de A, **When** la propietaria crea un pedido directo, **Then** el pedido, su registro de pago administrativo y su trabajo de impresión quedan asociados a A.
4. **Given** un pedido aprobado de A, **When** la propietaria lo marca como entregado, **Then** el cambio aparece únicamente en el panel y las actualizaciones en vivo de A.
5. **Given** un negocio suspendido y una propietaria autorizada, **When** abre el panel, **Then** puede consultar el historial y el motivo del estado, pero no iniciar nuevas operaciones comerciales.

---

### User Story 4 - Procesar pagos e impresión por negocio (Priority: P2)

Los eventos de cobro y los trabajos de impresión se procesan usando exclusivamente el contexto y la configuración del negocio que originó el pedido.

**Why this priority**: Los procesos externos y en segundo plano no tienen una pantalla que aporte contexto; sin una asociación explícita podrían cobrar o imprimir para el comercio equivocado.

**Independent Test**: Puede probarse confirmando pagos y reclamando impresiones para dos negocios con configuraciones separadas, incluidos eventos repetidos, fuera de orden o con contexto incompleto.

**Acceptance Scenarios**:

1. **Given** un intento de pago originado en A, **When** llega una confirmación válida, **Then** solo se actualizan el pago, pedido y trabajo de impresión de A usando la configuración de A.
2. **Given** una notificación de pago sin un negocio determinable y verificable, **When** se procesa, **Then** no modifica ningún registro y queda registrada para revisión segura.
3. **Given** un agente de impresión vinculado a A y a una sede autorizada, **When** solicita el próximo trabajo, **Then** nunca recibe trabajos de B ni de otra sede fuera de su alcance.
4. **Given** un negocio sin configuración de cobro o impresión, **When** se intenta iniciar la operación correspondiente, **Then** el sistema informa que falta configuración y no recurre a credenciales globales ni de otro negocio.
5. **Given** un pago iniciado antes de la suspensión del negocio, **When** llega una confirmación válida después de la suspensión, **Then** el cobro se concilia dentro del mismo negocio y el pedido ya pagado puede completar su procesamiento sin habilitar ventas nuevas.

---

### User Story 5 - Migrar el negocio existente (Priority: P2)

El negocio que hoy usa el sistema continúa operando como el primer tenant, con sus datos no pertenecientes al CMS y su acceso administrativo preservados.

**Why this priority**: La adopción multi-tenant no puede provocar pérdida de pedidos, pagos, carritos, impresiones ni acceso del negocio actual.

**Independent Test**: Puede probarse sobre una copia representativa de los datos actuales, comparando conteos, identificadores, estados y relaciones antes y después, y repitiendo los flujos críticos con el tenant inicial.

**Acceptance Scenarios**:

1. **Given** los datos operativos actuales, **When** se ejecuta la migración, **Then** todos los carritos, intentos de pago, pedidos, trabajos de impresión, configuraciones aplicables y usuarios administrativos quedan asignados al tenant inicial.
2. **Given** un registro que no puede asignarse de forma segura, **When** se valida la migración, **Then** el corte se bloquea y el registro queda identificado en un reporte accionable; no se asigna silenciosamente a otro negocio.
3. **Given** una migración satisfactoria, **When** el administrador actual ingresa y se ejecutan los flujos críticos, **Then** conserva acceso como propietario y el comportamiento operativo no relacionado con Strapi sigue disponible.

### Edge Cases

- Dos registros simultáneos intentan reservar el mismo identificador público con distinta capitalización o espacios.
- Una cuenta pertenece a varios negocios y conserva seleccionado un negocio anterior al abrir una dirección de otro.
- Un cliente cambia de negocio con un carrito persistido localmente o reutiliza un enlace de checkout anterior.
- Un proceso interno, actualización en vivo, limpieza de carritos o reintento se ejecuta sin un contexto de negocio explícito.
- Una confirmación de pago se repite, llega fuera de orden o contiene referencias que apuntan a negocios distintos.
- Un agente de impresión válido para una sede intenta reclamar o actualizar un trabajo de otra sede o negocio.
- Un negocio se suspende mientras existen carritos, pagos pendientes o trabajos de impresión en curso.
- Dos negocios generan el mismo número visible, identificador externo o clave de idempotencia dentro de cuentas de integración diferentes.
- La migración encuentra registros huérfanos, relaciones rotas o configuraciones globales que no pueden asignarse automáticamente.
- El tenant inicial debe conservar enlaces o sesiones existentes durante el período de transición sin convertirse en un tenant por defecto para solicitudes ambiguas nuevas.

## Requirements *(mandatory)*

### Scope Boundaries

**Included**:

- Alta autoservicio de un negocio, su propietaria y una sede inicial.
- Resolución inequívoca del negocio activo para experiencias públicas, administrativas y procesos internos.
- Aislamiento de todos los datos operativos actuales que no pertenecen al CMS: carritos temporales, intentos de pago, pedidos, trabajos de impresión, acceso administrativo y configuración operativa.
- Preservación de los flujos actuales de tienda, checkout, pedido, panel e impresión bajo un contexto de negocio.
- Migración de los datos operativos existentes a un tenant inicial.

**Excluded**:

- Migración, reemplazo o eliminación de Strapi y de sus categorías, productos y combos; el catálogo tenant-aware se especificará por separado.
- Edición y administración de catálogo.
- Invitaciones, permisos granulares y roles adicionales al de propietaria inicial.
- Gestión operativa de múltiples sedes más allá de crear y asociar la sede inicial.
- Planes, suscripciones, facturación de la plataforma y límites comerciales.
- Dominios personalizados, constructor de página pública y personalización avanzada de marca.
- Administración global de la plataforma, exportación o eliminación autoservicio de un tenant.

### Functional Requirements

- **FR-001**: El sistema DEBE permitir que una persona cree una cuenta y registre un negocio proporcionando, como mínimo, nombre del negocio, identificador público único y credenciales verificables de la propietaria.
- **FR-002**: El alta DEBE crear de forma indivisible el negocio, una sede inicial, la cuenta cuando corresponda y el vínculo de propietaria; si una parte falla, ninguna entidad parcial debe quedar activa.
- **FR-003**: Una persona autenticada DEBE poder registrar un negocio adicional y quedar vinculada como propietaria sin duplicar su identidad de plataforma.
- **FR-004**: El identificador público de cada negocio DEBE ser único después de normalizar mayúsculas, espacios y variantes equivalentes, y el sistema DEBE resolver conflictos concurrentes sin crear duplicados.
- **FR-005**: Cada negocio DEBE tener un estado explícito de onboarding, activo o suspendido; solo un negocio activo puede aceptar nuevas operaciones públicas.
- **FR-006**: El sistema DEBE determinar exactamente un negocio inequívoco antes de acceder a datos propios de un tenant en solicitudes públicas, administrativas, integraciones y procesos internos; el estado del negocio determina después qué acciones están permitidas.
- **FR-007**: Una solicitud con negocio inexistente, ambiguo o no determinable DEBE fallar de forma segura y NO DEBE usar un negocio global o al tenant inicial como alternativa implícita.
- **FR-008**: Cada acción protegida DEBE verificar que la cuenta autenticada mantiene un vínculo vigente con el negocio seleccionado; el cambio de contexto solo puede elegir negocios autorizados para esa cuenta.
- **FR-009**: Las sedes, carritos temporales, intentos de pago, pedidos, trabajos de impresión, configuraciones operativas y vínculos administrativos DEBEN tener un único negocio propietario identificable.
- **FR-010**: Un registro operativo creado para un negocio NO DEBE poder reasignarse a otro mediante los flujos normales del producto.
- **FR-011**: Toda lectura, listado, creación, actualización y eliminación de datos propios de un tenant DEBE limitarse al negocio resuelto, incluso cuando se proporcione un identificador válido perteneciente a otro negocio.
- **FR-012**: El sistema DEBE rechazar cualquier relación entre carrito, pago, pedido, impresión, sede, configuración o usuario operativo cuando las partes pertenezcan a negocios distintos.
- **FR-013**: La experiencia pública DEBE mostrar únicamente la identidad y el contenido operativo disponible del negocio resuelto, y DEBE permitir comprar sin exigir una cuenta de cliente.
- **FR-014**: Cada carrito DEBE quedar ligado al negocio donde se creó; al cambiar de negocio, el carrito debe separarse o invalidarse y nunca puede reutilizarse para un checkout de otro negocio.
- **FR-015**: Un intento de pago y el pedido resultante DEBEN pertenecer al mismo negocio que el carrito validado y DEBEN conservar las líneas, importes, moneda, datos del cliente y notas confirmados para esa operación.
- **FR-016**: Toda solicitud o notificación de pago DEBE incluir suficiente contexto verificable para determinar el negocio; si falta, es ambiguo o contradice los registros relacionados, no debe modificar estado alguno.
- **FR-017**: Las operaciones de cobro DEBEN usar exclusivamente la configuración asignada al negocio y DEBEN impedir el inicio del cobro cuando esa configuración no esté disponible o vigente.
- **FR-018**: El panel administrativo, sus actualizaciones en vivo, la creación de pedidos directos y los cambios de estado DEBEN operar exclusivamente sobre pedidos del negocio seleccionado.
- **FR-019**: Cada trabajo y agente de impresión DEBE estar vinculado a un negocio y una sede; un agente solo puede reclamar o actualizar trabajos dentro de ese alcance autorizado.
- **FR-020**: El onboarding DEBE informar a la propietaria qué prerrequisitos operativos faltan y DEBE impedir la activación pública hasta contar, como mínimo, con identidad verificada, identificador público, sede inicial, moneda, una oferta tenant-aware con al menos un ítem disponible y una modalidad de cobro propia habilitada; la impresión solo es obligatoria cuando el negocio decide usarla.
- **FR-021**: La migración DEBE crear un tenant inicial y asignarle todos los datos, configuraciones aplicables y accesos administrativos actuales que no pertenecen a Strapi.
- **FR-022**: La migración DEBE preservar identificadores, fechas, estados, importes y relaciones existentes, y DEBE producir una conciliación que identifique cualquier registro no asignado o inconsistente antes del corte.
- **FR-023**: Tras la migración, el administrador actual DEBE conservar acceso como propietario del tenant inicial y los flujos operativos existentes no relacionados con Strapi DEBEN superar sus pruebas de aceptación sin pérdida de datos.
- **FR-024**: Las operaciones sensibles DEBEN registrar al menos el negocio, actor, acción, resultado y momento para altas, cambios de contexto, denegaciones entre tenants y cambios de estado del negocio.
- **FR-025**: Los datos de clientes, credenciales y detalles de integraciones de un negocio NO DEBEN mostrarse en respuestas, errores, registros visibles ni eventos destinados a otro negocio.
- **FR-026**: Los procesos en segundo plano, reintentos, limpiezas y actualizaciones en vivo DEBEN conservar el alcance del negocio de cada registro y NO DEBEN procesar datos bajo un contexto global ambiguo.
- **FR-027**: Las reglas de numeración, duplicados e idempotencia DEBEN incorporar el contexto del negocio cuando un identificador pueda repetirse legítimamente entre negocios, sin debilitar la detección de duplicados dentro de uno mismo.
- **FR-028**: Esta feature NO DEBE introducir una dependencia nueva con Strapi ni incluir datos del CMS en la migración del tenant inicial.
- **FR-029**: Al suspender un negocio, el sistema DEBE bloquear nuevos carritos, checkouts y pedidos directos, mantener el historial disponible en modo de consulta para propietarias autorizadas y permitir la conciliación de pagos ya iniciados y el procesamiento de pedidos ya pagados, sin reabrir ventas nuevas.

### Key Entities

- **Negocio (Tenant)**: Frontera principal de propiedad y aislamiento. Incluye identidad interna, nombre, identificador público normalizado, estado operativo y fechas relevantes.
- **Sede**: Punto operativo perteneciente a un único negocio. El alta crea una sede inicial que permite asociar pedidos e impresión, aunque la gestión multi-sede queda fuera del alcance.
- **Usuario de plataforma**: Identidad global de una persona que puede vincularse a uno o más negocios sin duplicarse.
- **Membresía**: Relación entre usuario y negocio que expresa el acceso vigente y, en este alcance, la condición de propietaria.
- **Contexto de negocio**: Negocio inequívocamente resuelto para una interacción pública, sesión protegida, integración o proceso interno; determina qué datos y acciones están permitidos.
- **Configuración operativa del negocio**: Estado y referencias propias para cobros, impresión y demás capacidades necesarias; nunca se comparte ni se usa como alternativa implícita entre negocios.
- **Carrito temporal**: Selección validada de un cliente, perteneciente a un negocio, con líneas, importes, moneda y vencimiento.
- **Intento de pago**: Seguimiento de un cobro ligado a un carrito y negocio, incluidos estado, referencia externa, cliente e idempotencia.
- **Pedido**: Resultado comercial perteneciente a un negocio, con cliente, estado, origen, importes y detalle histórico de lo comprado.
- **Trabajo de impresión**: Instrucción operativa perteneciente a un negocio y sede, ligada a un pedido, con estado, reintentos y contenido imprimible.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Al menos el 90% de nuevos propietarios puede crear su cuenta y negocio y llegar al onboarding en menos de 3 minutos, sin asistencia, en pruebas de usabilidad.
- **SC-002**: El 100% de una matriz de pruebas con al menos dos negocios bloquea lecturas, escrituras, relaciones, eventos de pago, actualizaciones en vivo y reclamos de impresión entre tenants.
- **SC-003**: El 100% de las solicitudes de prueba con negocio inexistente, ambiguo o no autorizado termina sin mostrar ni modificar datos de otro negocio y sin usar un tenant por defecto.
- **SC-004**: El 100% de los registros operativos no pertenecientes a Strapi queda asignado al tenant inicial; conteos, identificadores, estados, importes y relaciones concilian con el origen y no quedan registros huérfanos al autorizar el corte.
- **SC-005**: Los recorridos de registro, acceso administrativo, carrito, checkout, confirmación de pago, consulta y actualización de pedidos, pedido directo e impresión se completan de punta a punta para dos negocios y cada resultado aparece solo en su espacio.
- **SC-006**: En condiciones normales de operación, al menos el 95% de las personas obtiene la presencia pública o el panel del negocio correcto en menos de 2 segundos desde que inicia la navegación.
- **SC-007**: Ninguna prueba de aceptación ni piloto controlado produce una exposición o modificación cruzada de datos entre negocios, y el 100% de los intentos simulados queda denegado y trazable.
- **SC-008**: El 100% de los intentos de cobro o impresión de un negocio sin configuración propia se detiene con un estado accionable y sin utilizar configuración global o ajena.
- **SC-009**: El tenant inicial supera el 100% de las pruebas de regresión acordadas para los flujos operativos actuales que no dependen de Strapi.

## Assumptions

- Un tenant representa un negocio jurídicamente u operativamente independiente; una identidad personal puede ser propietaria de más de un negocio mediante membresías separadas.
- Cada alta crea una sola sede inicial. La creación y gestión de sedes adicionales se abordará en otra feature.
- El alcance inicial solo necesita el rol de propietaria. Invitaciones, colaboradores y permisos granulares se definirán en la feature de autenticación y roles.
- El identificador público permite localizar un negocio de forma estable; la decisión entre subdominio, ruta u otro esquema se tomará durante el diseño sin cambiar la regla de aislamiento.
- Un negocio nuevo permanece en onboarding hasta cumplir los prerrequisitos para aceptar pedidos. La activación no debe asumir catálogo, cuenta de cobro o impresora globales.
- La moneda y la modalidad de cobro se definen por negocio. La impresión es una capacidad opcional y solo se convierte en requisito de onboarding cuando la propietaria la habilita.
- Todos los datos operativos actuales no administrados por Strapi pertenecen al negocio existente y pueden asignarse a un único tenant inicial, sujeto a conciliación previa.
- La sustitución de Strapi y el catálogo tenant-aware son una dependencia separada para activar negocios en producción. Esta feature solo define la frontera que debe respetar cualquier fuente futura de catálogo.
- La vinculación y renovación autoservicio de cuentas de cobro y agentes de impresión puede implementarse en features posteriores; esta base debe asociar su estado al negocio y prohibir cualquier alternativa global implícita.
- La identidad verificable de la propietaria y la recuperación de acceso seguirán las políticas definidas por la feature de autenticación, sin alterar la creación indivisible del negocio y su membresía.
- No se incluyen planes, facturación SaaS, dominios personalizados, personalización avanzada, administración global, eliminación de tenants ni operación multi-sede.
