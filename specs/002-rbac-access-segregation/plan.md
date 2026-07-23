# Implementation Plan: Segregación de accesos por rol

**Branch**: `feature/002-rbac` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-rbac-access-segregation/spec.md`

**Owning Repository**: Core (Next.js)

**External Consumer Impact**: None. El sistema de roles es interno de Core. `komanda-business` no necesita cambios porque sigue aprovisionando únicamente propietarios (rol owner por defecto).

## Summary

Implementar un sistema de roles (owner, admin, employee) en el panel administrativo de Core. Cada rol tiene permisos diferenciados sobre catálogo, pedidos, configuración, integraciones, onboarding y gestión de miembros. El owner puede gestionar miembros desde una página dedicada. Los roles se verifican tanto en backend (API routes) como en frontend (renderizado condicional).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24

**Primary Dependencies**: Drizzle ORM 0.45.2, Drizzle Kit 0.31, Zod 4 para validación de schemas, `jose` para sesiones

**Storage**: PostgreSQL 17 con tabla `tenant_memberships` existente (agregar soporte para múltiples roles)

**Testing**: Vitest 4 para unit/integration/contract/isolation; Playwright para E2E browser

**Target Platform**: Linux containers (Next.js App Router)

**Project Type**: Web application (Next.js con panel admin, API routes, Server Actions)

**Performance Goals**: La verificación de rol no debe agregar más de 10ms por solicitud. La página de gestión de miembros debe cargar en menos de 2 segundos con hasta 50 miembros.

**Constraints**: fail closed sin rol; solo owner puede modificar membresías; el último owner no puede cambiarse/revocarse; contexto de tenant verificado

**Scale/Scope**: 3 roles (owner, admin, employee); ~5 páginas admin afectadas; ~15 API routes protegidas

**Cross-Repository Contracts**: None

**Supported Clients**: Panel administrativo web (Next.js); sin cambios en storefront público ni en `komanda-business`

**Degraded Mode**: Servicio de autorización no disponible → denegar todas las operaciones protegidas (fail closed). Error en carga de miembros → owner no puede gestionar membresías temporalmente.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Core ownership**: **PASS** — Core es la fuente autoritativa de membresías y roles. No hay dependencia externa para autorización.
- **Independent delivery**: **PASS** — Los cambios son exclusivos de Core. No requieren despliegue coordinado con otros repositorios.
- **Contract and mobile readiness**: **PASS** — El servicio de autorización se implementa como servicio de aplicación independiente de Next.js, reutilizable por futuros clientes móviles o API.
- **Tenant isolation**: **PASS** — Los roles son locales al tenant. Un miembro de tenant A no tiene acceso al tenant B. Matriz de dos tenantes con roles cruzados definida en tests.
- **Performance and operations**: **PASS** — La verificación de rol es una consulta indexada adicional en la misma transacción. Se definen tests de presupuesto de consultas.
- **Migration and rollback**: **N/A** — Cambio aditivo sobre tabla existente (no destructivo). La migración agrega soporte para nuevos valores de rol sin eliminar datos existentes. Rollback: revertir aplicación y migración.

## Current-State Findings

| Current area | Limitation found | Plan |
|---|---|---|
| `tenant_memberships.role` tipo `"owner"` literal | Solo acepta un rol | Expandir a `"owner" | "admin" | "employee"` |
| `TenantActor.role` tipo `"owner"` literal | No representa roles adicionales | Expandir union type |
| `LiveMembership.role` tipo `"owner"` | Idem | Expandir type |
| Zod schemas en provisioning | Enforce `z.literal("owner")` | Agregar union con nuevos roles para mutations pero mantener owner por defecto en provisioning |
| Admin layout y páginas | Sin verificación de rol | Agregar guard condicional por rol |
| API routes de catálogo/config/integraciones | Sin verificación de rol | Agregar authorizeRole() antes de cada operación |
| No existe página de gestión de miembros | No hay forma de agregar admin/employee | Crear `/admin/[tenantId]/members` |
| No hay eventos de auditoría para membresías | Sin trazabilidad | Agregar audit events en cambios de membresía |

## Target Architecture

### Authorization flow

```text
request → session auth → resolve tenant + membership role
                                      │
                                      ▼
                          authorizeRole(actor, allowedRoles)
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                      role allowed           role denied
                          │                       │
                          ▼                       ▼
                    execute operation       return 404 / redirect
```

### Permission matrix

| Sección | Owner | Admin | Employee |
|---------|-------|-------|----------|
| Dashboard/Estado | Sí | Sí | Sí |
| Pedidos (ver + gestionar) | Sí | Sí | Sí |
| Catálogo (CRUD) | Sí | Sí | No |
| Catálogo (solo lectura) | Sí | Sí (igual) | Sí |
| Configuración | Sí | No | No |
| Integraciones | Sí | No | No |
| Onboarding/Activación | Sí | No | No |
| Gestión de miembros | Sí | No | No |

## Project Structure

### Documentation (this feature)

```text
specs/002-rbac-access-segregation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/(admin)/admin/[tenantId]/
│   ├── layout.tsx              # Nav condicional por rol
│   ├── catalog/page.tsx        # Check de rol + modo lectura para employee
│   ├── settings/page.tsx       # Owner only
│   ├── integrations/page.tsx   # Owner only
│   ├── onboarding/page.tsx     # Owner only
│   └── members/                # NUEVA: gestión de miembros (Owner only)
│       └── page.tsx
├── db/schema/
│   └── platform.ts             # Expandir tipo role
├── lib/
│   ├── tenant-context/
│   │   └── types.ts            # Expandir TenantActor.role
│   └── authorization/
│       └── role-guard.ts       # NUEVO: guard utility
├── features/
│   ├── identity/
│   │   ├── application/
│   │   │   └── session.service.ts  # Expandir LiveMembership.role
│   │   ├── infrastructure/
│   │   │   └── session.repository.ts  # Sin cambios mayores
│   │   └── web/
│   │       └── tenant-authority.ts    # Pasar rol a actor
│   ├── members/                 # NUEVO: gestión de miembros
│   │   ├── domain/
│   │   │   └── member.schemas.ts   # Zod schemas para validación
│   │   ├── application/
│   │   │   └── member.service.ts
│   │   ├── infrastructure/
│   │   │   └── member.repository.ts
│   │   └── web/
│   │       └── MemberManager.tsx
│   └── provisioning/
│       └── domain/
│           └── provisioning.schemas.ts  # Expandir zod schemas
├── drizzle/
│   └── 0016_rbac_roles.sql      # NUEVA: migración para expandir constraint de rol
└── tests/
    ├── integration/
    │   └── rbac.integration.test.ts     # NUEVO
    ├── tenant-isolation/
    │   └── rbac-isolation.integration.test.ts  # NUEVO
    └── e2e/
        └── rbac-members.spec.ts         # NUEVO
```

**Structure Decision**: Se mantiene la estructura actual del proyecto. Se agrega un nuevo feature domain `members/` para la gestión de miembros, un nuevo lib `authorization/` para guards reutilizables, y una nueva página admin. No se crean nuevos deployables.

## Complexity Tracking

No constitutional violations. All changes are additive and internal to Core.
