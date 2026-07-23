# Feature Specification: Segregación de accesos por rol

**Feature Branch**: `feature/002-rbac`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Se segregación de accesos según el tipo de persona que lo use, por ejemplo no mostrar la parte de modificación de artículos para una persona catalogada como empleado y no dueño. Se necesita un sistema de roles: owner con acceso total, admin que puede gestionar catálogo y pedidos, y employee que solo puede ver el catálogo y gestionar pedidos."

## System Boundaries *(mandatory)*

- **Owning Repository**: Core (Next.js)
- **Affected Surfaces**: panel administrativo de `app.komanda.com` en todas las rutas con prefijo `/admin/[tenantId]/`; API routes internas de catálogo, pedidos, configuración, integraciones y activación; esquema de base de datos de membresías
- **Source of Truth**: Core es la fuente autoritativa de roles, membresías y permisos por tenant. Cada operación protegida verifica el rol del actor antes de ejecutarse.
- **External Contract**: None. El sistema de roles es interno de Core y no se expone en contratos versionados externos en esta versión. `komanda-business` continúa aprovisionando únicamente propietarios (rol owner).
- **Failure Isolation**: Una falla en el servicio de autorización no debe permitir acceso no autorizado por defecto (fail closed). Una falla en la resolución de roles debe denegar la operación.
- **Tenant Impact**: Cada tenant administra sus propios miembros y roles. Un owner de tenant A no puede modificar membresías del tenant B. Los roles son locales al tenant.
- **Future Client Compatibility**: La verificación de permisos por rol se implementa como un servicio de aplicación reutilizable, no acoplado a Next.js Server Actions ni a la interfaz web actual. Futuros clientes móviles o API podrán consumir el mismo servicio de autorización.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Expandir el sistema de roles para soportar owner, admin y employee (Priority: P1)

El sistema actual solo reconoce el rol "owner". Un owner puede asignar a otros miembros de su tenant los roles "admin" o "employee", y el sistema debe reconocer y hacer cumplir estos roles en todas las operaciones protegidas.

**Why this priority**: Sin la expansión del modelo de datos y tipos, no es posible distinguir permisos entre usuarios. Es la base de todas las historias siguientes.

**Independent Test**: Crear tres membresías en un mismo tenant con roles distintos (owner, admin, employee) y verificar que el sistema almacena correctamente el rol y lo expide en las respuestas de autorización sin errores.

**Acceptance Scenarios**:

1. **Given** un tenant con tres membresías activas con roles "owner", "admin" y "employee", **When** se resuelve el contexto de cada actor, **Then** el `TenantActor.role` refleja el valor correcto asignado a cada membresía.
2. **Given** una membresía existente con rol "owner", **When** el owner modifica el rol a "admin", **Then** el cambio persiste y el nuevo rol se refleja en autorizaciones posteriores.
3. **Given** una membresía con rol "employee", **When** se intenta asignar un rol no soportado ("superadmin"), **Then** el sistema rechaza la operación.

---

### User Story 2 - Servicio de autorización por rol (Priority: P1)

Las API routes y páginas del panel administrativo deben verificar el rol del actor antes de permitir el acceso. Un usuario sin el rol requerido recibe un error de acceso denegado (404 no revelador) o se le oculta la interfaz correspondiente.

**Why this priority**: Sin la verificación en backend y frontend, los roles no tendrían efecto real y cualquier miembro podría acceder a operaciones restringidas.

**Independent Test**: Ejecutar la misma operación de catálogo (crear, modificar, eliminar) con actores de cada rol y verificar que solo owner y admin pueden completarla, mientras employee recibe un error de acceso.

**Acceptance Scenarios**:

1. **Given** un actor con rol "employee", **When** intenta crear o modificar un artículo del catálogo mediante la API, **Then** el sistema rechaza la operación con un error no revelador.
2. **Given** un actor con rol "employee", **When** accede a la página de catálogo (`/admin/[tenantId]/catalog`), **Then** la interfaz se renderiza en modo solo lectura sin botones de crear, editar ni eliminar.
3. **Given** un actor con rol "admin", **When** accede a la página de configuración (`/admin/[tenantId]/settings`), **Then** el sistema redirige o muestra un error de acceso.

---

### User Story 3 - Navegación condicional por rol (Priority: P1)

El menú de navegación del panel administrativo debe mostrar solo las secciones que el rol del usuario puede visitar. Owner ve todas las secciones; admin ve catálogo y pedidos; employee ve pedidos y catálogo (solo lectura).

**Why this priority**: La experiencia de usuario debe reflejar inmediatamente los permisos del rol sin intentar acceder a rutas prohibidas.

**Independent Test**: Iniciar sesión como cada rol y verificar que los enlaces de navegación visibles coinciden con los permisos definidos.

**Acceptance Scenarios**:

1. **Given** un actor con rol "owner", **When** se renderiza el layout del panel, **Then** ve enlaces a Estado, Pedidos, Catálogo, Configuración, Integraciones y Miembros.
2. **Given** un actor con rol "admin", **When** se renderiza el layout, **Then** ve enlaces a Estado, Pedidos y Catálogo; NO ve Configuración, Integraciones ni Miembros.
3. **Given** un actor con rol "employee", **When** se renderiza el layout, **Then** ve enlaces a Estado y Pedidos; NO ve Catálogo, Configuración, Integraciones ni Miembros.

---

### User Story 4 - Gestión de miembros del tenant (Priority: P2)

El owner puede ver la lista de miembros del tenant, agregar nuevos miembros con un rol específico (admin o employee), cambiar el rol de un miembro existente y revocar membresías.

**Why this priority**: La gestión de miembros es necesaria para que el owner pueda otorgar acceso a empleados y administradores. Sin esta función, los roles adicionales no pueden asignarse.

**Independent Test**: El owner accede a una página dedicada, agrega un nuevo miembro con rol admin, cambia el rol a employee y revoca la membresía, verificando que cada acción persiste y se refleja en los permisos del usuario.

**Acceptance Scenarios**:

1. **Given** un owner autenticado en su tenant, **When** accede a `/admin/[tenantId]/members`, **Then** ve una tabla con todos los miembros, su email, rol y estado.
2. **Given** un owner en la página de miembros, **When** completa el formulario para agregar un nuevo miembro con email y rol, **Then** el sistema crea la membresía y el nuevo miembro aparece en la tabla.
3. **Given** un owner en la página de miembros, **When** cambia el rol de un miembro existente de "admin" a "employee", **Then** el cambio persiste y el miembro pierde los permisos del rol anterior.
4. **Given** un owner en la página de miembros, **When** revoca la membresía de un miembro, **Then** el miembro pierde inmediatamente el acceso al tenant.

---

### User Story 5 - Auditoría de cambios de membresía y roles (Priority: P3)

Cada cambio en una membresía (creación, cambio de rol, revocación) queda registrado en el log de auditoría con el actor que realizó el cambio, el rol anterior y el nuevo rol.

**Why this priority**: La trazabilidad es importante para la seguridad operativa y para resolver incidentes de acceso.

**Independent Test**: Realizar una secuencia de cambios de membresía y verificar que cada evento queda registrado en la tabla de auditoría con los detalles correspondientes.

**Acceptance Scenarios**:

1. **Given** un owner que agrega un nuevo miembro, **When** se completa la operación, **Then** se registra un evento de auditoría con tipo "membership_created", actor, email del miembro y rol asignado.
2. **Given** un owner que cambia el rol de un miembro, **When** se completa la operación, **Then** se registra un evento con tipo "membership_role_changed", rol anterior y nuevo rol.
3. **Given** un owner que revoca una membresía, **When** se completa la operación, **Then** se registra un evento con tipo "membership_revoked".

---

### Edge Cases

- Un miembro con membresía revocada no debe poder acceder a ninguna página del tenant, independientemente de su rol anterior.
- Cambiar el rol de un miembro no debe afectar su sesión activa actual, pero el nuevo rol debe aplicarse en su próxima solicitud autorizada.
- El owner no debe poder cambiar su propio rol ni revocar su propia membresía.
- Si no hay ningún otro owner, el sistema debe impedir que el último owner cambie su rol o se revoque a sí mismo.
- Agregar un miembro con un email que no existe como usuario en Core debe permitir la creación de la membresía (el usuario existe globalmente por diseño del sistema multitenant).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE soportar los roles "owner", "admin" y "employee" en la tabla `tenant_memberships`.
- **FR-002**: El rol DEBE ser un valor requerido al crear o modificar una membresía.
- **FR-003**: El sistema DEBE verificar el rol del actor antes de permitir cualquier operación protegida (catálogo CRUD, configuración, integraciones, activación, gestión de miembros).
- **FR-004**: Las API routes de catálogo (crear, modificar, archivar categorías, items, combos, addons) DEBEN denegar el acceso a roles sin permiso "employee" (employee no puede modificar catálogo).
- **FR-005**: Las API routes de configuración, integraciones y activación DEBEN denegar el acceso a roles que no sean "owner".
- **FR-006**: Las API routes de gestión de miembros DEBEN denegar el acceso a roles que no sean "owner".
- **FR-007**: Las API routes de pedidos (listar, crear directo, cambiar estado, ver detalle) DEBEN permitir el acceso a todos los roles activos.
- **FR-008**: La navegación del panel administrativo DEBE mostrar solo las secciones permitidas según el rol del usuario.
- **FR-009**: La página de catálogo DEBE renderizarse en modo solo lectura para el rol "employee" (sin botones de crear, editar ni eliminar).
- **FR-010**: La página de configuración DEBE ser accesible solo para el rol "owner".
- **FR-011**: La página de integraciones DEBE ser accesible solo para el rol "owner".
- **FR-012**: La página de onboarding/estado DEBE ser accesible solo para el rol "owner".
- **FR-013**: La página de miembros (`/admin/[tenantId]/members`) DEBE ser accesible solo para el rol "owner".
- **FR-014**: El owner DEBE poder ver la lista de miembros, agregar nuevos miembros, cambiar roles y revocar membresías desde la página de miembros.
- **FR-015**: El owner NO DEBE poder cambiar su propio rol ni revocar su propia membresía.
- **FR-016**: El sistema DEBE impedir que el último owner con membresía activa cambie su rol o se revoque.
- **FR-017**: Cada cambio de membresía (creación, cambio de rol, revocación) DEBE registrarse en el log de auditoría.
- **FR-018**: Los eventos de membresía en la tabla de auditoría DEBEN incluir tipo de evento, actor, email del miembro, rol anterior y nuevo rol cuando corresponda.
- **FR-019**: Una membresía revocada DEBE denegar inmediatamente el acceso al tenant, independientemente del rol anterior.

### Key Entities

- **Membresía (tenant_memberships)**: Representa la relación entre un usuario global y un tenant. Atributos clave: rol (owner/admin/employee), estado (active/revoked). Cada usuario tiene una membresía por tenant.
- **Rol**: Categoría de permiso que determina qué operaciones puede realizar un miembro dentro de un tenant. Los roles disponibles son owner (acceso total), admin (gestión de catálogo y pedidos) y employee (solo lectura de catálogo y gestión de pedidos).
- **Evento de auditoría (audit_events)**: Registro inmutable de cambios en membresías para trazabilidad. Incluye tipo de evento, actor, detalles del cambio y timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un owner puede agregar un nuevo miembro con rol admin o employee en menos de 30 segundos desde la interfaz de gestión de miembros.
- **SC-002**: Un employee que intenta modificar el catálogo recibe un error de acceso denegado en menos de 1 segundo.
- **SC-003**: Todos los cambios de membresía quedan registrados en el log de auditoría con el tipo de evento, actor, email y roles anterior/nuevo correspondientes.
- **SC-004**: La navegación del panel muestra solo las secciones permitidas para cada rol sin errores de renderizado.
- **SC-005**: Una membresía revocada desde la interfaz de miembros deja de tener efecto inmediatamente en la siguiente solicitud del usuario.

## Assumptions

- El usuario al que se asigna una membresía ya existe como usuario global en Core (el sistema de aprovisionamiento de SPEC-001 garantiza que los usuarios existen globalmente).
- No se requiere flujo de invitación por email en esta versión. El owner agrega miembros directamente por email del usuario existente.
- El catálogo ya está migrado a Core PostgreSQL (SPEC-001 completado) y no depende de Strapi.
- La API route de pedidos actualmente no discrimina por rol y se modificará para mantener el comportamiento actual para todos los roles (permitir a todos).
- El sistema de sesiones y membresías de SPEC-001 ya permite resolver el rol del actor en cada solicitud protegida.
