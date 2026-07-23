# Research: Segregación de accesos por rol

## Decision 1: Expansión del tipo role en el schema

**Decision**: Expandir la columna `role` en `tenant_memberships` de `"owner"` a `"owner" | "admin" | "employee"` usando el mismo tipo `text` con `$type<>` de Drizzle y un CHECK constraint en SQL.

**Rationale**:
- Consistente con el diseño actual del schema (ya usa `$type<>` con string literals)
- CHECK constraint garantiza integridad a nivel DB
- No requiere migración de datos existentes (el valor "owner" sigue siendo válido)
- Drizzle `$type<>` proporciona type-safety en TypeScript

**Alternatives considered**:
- Enum nativo de PostgreSQL: más rigidez, pero requiere migración más compleja y no aporta ventajas significativas sobre CHECK constraint
- Tabla separada de roles: overkill para solo 3 roles fijos
- JSONB con permisos: más flexible pero sin type-safety y más difícil de consultar

---

## Decision 2: Estrategia de autorización

**Decision**: Función `authorizeRole()` que recibe `TenantContext` y array de roles permitidos. Lanza `TenantAccessDeniedError` si el rol del actor no está en la lista.

**Rationale**:
- Simple, explícito y fácil de testear
- Reutilizable en API routes, Server Actions y page components
- Consistent with existing `withTenantTransaction()` pattern
- Fail closed: si no se llama a `authorizeRole()`, la operación no tiene verificación (pero se audita en code review)
- Error no revelador (404) para no exponer existencia de recursos

**Alternatives considered**:
- Middleware centralizado con mapas de ruta→rol: más complejo, difícil de mantener con la estructura de App Router de Next.js
- Decoradores o guards tipo NestJS: no compatibles con Next.js App Router
- Casl/accesscontrol library: dependencia externa para un caso simple

---

## Decision 3: Renderizado condicional vs redirect

**Decision**: El layout del panel admin muestra nav condicional según rol. Las páginas individuales verifican el rol y redirigen a 404 si no tienen permiso. El catálogo en modo employee se renderiza como solo lectura (mismos datos, sin botones de acción).

**Rationale**:
- La nav condicional evita frustración del usuario (no ve enlaces que no puede usar)
- El redirect a 404 en página individual es capa de seguridad adicional por si alguien accede directamente por URL
- El modo lectura en catálogo permite a employee ver precios y disponibilidad sin modificar

**Alternatives considered**:
- Un solo redirect en layout: más simple pero no permite el modo lectura de catálogo
- Ocultar completamente la página: employee no podría ver el catálogo (requerido por la spec)

---

## Decision 4: Gestión de miembros sin flujo de invitación

**Decision**: El owner agrega miembros directamente por email del usuario existente. No hay flujo de invitación por email en v1.

**Rationale**:
- Los usuarios ya existen globalmente en Core (SPEC-001)
- El owner conoce el email del empleado/admin
- Simplifica enormemente la implementación inicial
- El flujo de invitación puede agregarse en una versión posterior

**Alternatives considered**:
- Invitación por email con link de registro: más complejo, requiere manejo de estados de invitación pendiente
- Auto-registro con código de tenant: riesgo de seguridad, sin control de owner

---

## Decision 5: Protección del último owner

**Decision**: El sistema impide que el último owner con membresía activa cambie su rol a admin/employee o se revoque a sí mismo. Se verifica en el service layer antes de ejecutar la mutación.

**Rationale**:
- Garantiza que siempre haya al menos un owner por tenant
- Consistente con la spec FR-016
- Se implementa como una consulta COUNT adicional en la misma transacción

**Alternatives considered**:
- CHECK constraint a nivel DB: más difícil de implementar con la lógica condicional
- Delegar al cliente: riesgo de seguridad, el backend debe ser la autoridad

---

## Decision 6: Error handling when adding member with non-existent user

**Decision**: Si el owner intenta agregar un miembro con un email que no corresponde a un usuario existente en Core, el sistema devuelve un error claro indicando que el usuario no existe. El owner debe primero asegurar que el usuario esté registrado.

**Rationale**:
- La spec asume que los usuarios existen globalmente (SPEC-001)
- Un error claro evita confusión sobre si el problema es técnico o de datos
- No se crea una membresía huérfana sin usuario válido
- Permite al owner informar al empleado que debe registrarse primero (si aplica en el futuro)

**Alternatives considered**:
- Crear el usuario automáticamente: requeriría más datos (password, verificación) que el owner no debería proveer
- Fallar silenciosamente: mala UX, el owner no sabría si la operación tuvo efecto
- Crear membresía pendiente: complejidad adicional sin necesidad en v1
