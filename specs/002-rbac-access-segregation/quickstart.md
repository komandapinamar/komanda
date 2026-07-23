# Quickstart: Segregación de accesos por rol

## Prerequisites

- Core application running with PostgreSQL
- At least one provisioned tenant with owner membership
- Test users with known email/password

## Validation scenarios

### 1. Expansión de roles en base de datos

```bash
npm run db:migrate
```

**Expected**: La migración `0016_rbac_roles.sql` se aplica sin errores. La columna `role` en `tenant_memberships` ahora acepta `admin` y `employee`.

```sql
-- Verificar que el constraint acepta los nuevos valores
INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
VALUES ('<tenant-id>', '<user-id>', 'admin', 'active');
-- No debe lanzar error

INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
VALUES ('<tenant-id>', '<user-id>', 'employee', 'active');
-- No debe lanzar error

-- Verificar que rechaza valores inválidos
INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
VALUES ('<tenant-id>', '<user-id>', 'superadmin', 'active');
-- Debe lanzar CHECK constraint violation
```

### 2. Verificación de roles en API

```bash
# Como owner - debe funcionar
curl -X POST /api/v1/tenants/{tenantId}/catalog/categories \
  -H "Authorization: Bearer {owner-token}" \
  -d '{"name":"Bebidas"}'
# → 201 Created

# Como employee - debe denegar
curl -X POST /api/v1/tenants/{tenantId}/catalog/categories \
  -H "Authorization: Bearer {employee-token}" \
  -d '{"name":"Bebidas"}'
# → 404 Not Found (no revelador)

# Como employee - acceder a pedidos debe funcionar
curl -X GET /api/v1/tenants/{tenantId}/orders \
  -H "Authorization: Bearer {employee-token}"
# → 200 OK
```

### 3. Gestión de miembros (Owner only)

```bash
# Navegar a /admin/{tenantId}/members
# Ver: tabla con miembros existentes

# Agregar nuevo miembro con rol employee
# POST al endpoint con { user_id, role: "employee" }
# Ver: miembro aparece en tabla

# Cambiar rol a admin
# PATCH al endpoint con { role: "admin" }
# Ver: rol actualizado en tabla

# Revocar miembro
# DELETE al endpoint
# Ver: miembro ya no aparece en tabla o aparece como revoked

# Verificar que employee no tiene acceso a /members
curl -X GET /api/v1/tenants/{tenantId}/members \
  -H "Authorization: Bearer {employee-token}"
# → 404 Not Found
```

### 4. Navegación condicional

```bash
# Login como owner → ver enlaces a: Estado, Pedidos, Catálogo, Configuración, Integraciones, Miembros
# Login como admin  → ver enlaces a: Estado, Pedidos, Catálogo
# Login como employee → ver enlaces a: Estado, Pedidos
```

### 5. Catálogo modo lectura para employee

```bash
# Login como employee → navegar a /admin/{tenantId}/catalog
# Ver: lista de categorías e items sin botones de crear/editar/eliminar
# Intentar POST a catalog API → 404
```

### 6. Aislamiento entre tenants

```bash
# Crear membresías con roles en tenant A y tenant B
# Verificar que admin de tenant A no puede acceder a recursos de tenant B
curl -X GET /api/v1/tenants/{tenantBId}/orders \
  -H "Authorization: Bearer {adminA-token}"
# → 404 Not Found (sin importar el rol)
```

### 7. Casos borde

```bash
# Cambio de rol no afecta sesión activa
# 1. Owner cambia rol de admin a employee
# 2. Admin hace petición inmediatamente después
# → Aún tiene permisos de admin en esta solicitud
# 3. Admin hace nueva solicitud
# → Ahora tiene permisos de employee

# Error al agregar miembro con email inexistente
curl -X POST /api/v1/tenants/{tenantId}/members \
  -H "Authorization: Bearer {owner-token}" \
  -d '{"email":"nonexistent@example.com","role":"employee"}'
# → 400 Bad Request con mensaje "User not found"

# Último owner no puede cambiarse ni revocarse
# Owner intenta cambiar su propio rol
curl -X PATCH /api/v1/tenants/{tenantId}/members/{ownMembershipId} \
  -H "Authorization: Bearer {owner-token}" \
  -d '{"role":"admin"}'
# → 400 Bad Request con mensaje indicando que es el último owner

# Membresía revocada deniega acceso inmediatamente
# 1. Owner revoca membresía de un miembro
# 2. Miembro revocado intenta acceder
curl -X GET /api/v1/tenants/{tenantId}/orders \
  -H "Authorization: Bearer {revokedMember-token}"
# → 404 Not Found
```
