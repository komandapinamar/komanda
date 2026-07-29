# Implementation Plan: Add Shadow Members

**Branch**: `002-add-shadow-members` | **Date**: 2026-07-23 | **Spec**: [specs/002-add-shadow-members/spec.md](spec.md)

**Input**: Feature specification from `/specs/002-add-shadow-members/spec.md`

## Summary

Allow Tenant Owners to invite new members by email even if the user does not have an account. The system will create a "Shadow User" with a placeholder password hash (`!INVITED_USER!`) and `pending_verification` status, seamlessly generating the membership and avoiding the current "User not found" errors.

## Technical Context

**Language/Version**: TypeScript

**Primary Dependencies**: Next.js, Drizzle ORM

**Storage**: PostgreSQL

**Testing**: Vitest, Playwright

**Target Platform**: Web application / API

**Project Type**: web-service/web-app

**Performance Goals**: N/A (Standard API latency)

**Constraints**: Must not require database schema migrations (handled via existing `users` table).

**Scale/Scope**: Feature implementation affecting single API endpoint and service layer.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution file violations. The design adheres to the system's existing ORM patterns, respects transaction scopes, and reuses the existing data model by adopting the Shadow User strategy.

## Project Structure

### Documentation (this feature)

```text
specs/002-add-shadow-members/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (to be created)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/v1/tenants/[tenantId]/members/
│   │   └── route.ts                      # API route handler
│   ├── api/v1/users/invitations/
│   │   └── route.ts                      # API token consumer (backend)
│   └── (public)/accept-invitation/
│       └── page.tsx                      # Activation UI (frontend)
├── features/
│   ├── members/
│   │   ├── application/
│   │   │   └── member.service.ts         # Core business logic (shadow user creation)
│   │   └── infrastructure/
│   │       └── member.repository.ts      # Database queries (insert user)
│   └── identity/
│       ├── application/
│       │   └── identity-verification.service.ts # To create verification challenges
│       └── infrastructure/
│           └── identity.repository.ts
```

**Structure Decision**: The implementation will fit seamlessly into the existing feature module structure under `src/features/members/`.

## Complexity Tracking

No complexity violations identified. The Shadow User approach actively reduces complexity by avoiding database migrations for the `tenantMemberships` table.
