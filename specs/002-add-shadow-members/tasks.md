---
description: "Task list for Add Shadow Members feature implementation"
---

# Tasks: Add Shadow Members

**Input**: Design documents from `/specs/002-add-shadow-members/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are excluded as they were not explicitly requested.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths are included in descriptions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Verify project environment is running and test database is seeded (e.g. via `seed-dev-tenant.ts`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

*(No foundational tasks required: database schema already supports the Shadow User strategy without migrations).*

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 2 - Invited User Account Creation (Shadow User) (Priority: P1) 🎯 MVP

**Goal**: Create a placeholder account for invited members who don't exist, so they can be linked to the tenant membership without requiring schema changes.

**Independent Test**: Can be verified by triggering the repository and service functions in isolation or via a test script to confirm a user with `!INVITED_USER!` hash is created.

### Implementation for User Story 2

- [X] T002 [US2] Implement `createShadowUser(email: string)` method in `src/features/members/infrastructure/member.repository.ts` that generates a UUID, normalizes the email, and inserts a `pending_verification` user with password `!INVITED_USER!`
- [X] T003 [US2] Update `addMember` in `src/features/members/application/member.service.ts` to intercept null users from `findByUserEmail` and call `createShadowUser` instead of throwing `UserNotFoundError`

**Checkpoint**: At this point, the backend is capable of creating shadow users and linking them to memberships.

---

## Phase 4: User Story 1 - Invite a New Member by Email (Priority: P1)

**Goal**: Allow a Tenant Owner to add a new member by simply providing their email address, avoiding "User not found" errors.

**Independent Test**: Can be tested by hitting the `POST /api/v1/tenants/[tenantId]/members` endpoint directly with a new email and verifying a 201 Created response.

### Implementation for User Story 1

- [X] T004 [US1] Review `src/app/api/v1/tenants/[tenantId]/members/route.ts` to ensure the route correctly returns `201 Created` with the newly created shadow member data, removing any dead code related to handling `UserNotFoundError` if it's no longer thrown.
- [X] T005 [US1] Verify the client component in `src/features/members/web/MemberManager.tsx` handles the successful 201 response seamlessly and appends the shadow user to the list.

**Checkpoint**: At this point, the full API and UI integration works.

---

## Phase 5: User Story 3 - Accept Invitation and Set Password (Priority: P1)

**Goal**: Deliver an invitation email using existing verification ports and provide an activation UI for users to set their password.

**Independent Test**: Simulate the token creation or capture it from the local test environment and hit the new `accept-invitation` UI. Submit a password to ensure it updates the user status to `active`.

### Implementation for User Story 3

- [x] T006 [US3] In `src/features/identity/application/identity-verification.service.ts` (or equivalent location), create a method `generateInvitationChallenge(userId, email, tenantId)` that creates a new `identityVerificationChallenges` record, generates an invitation token, and calls the `VerificationDelivery` port to fake/send the email.
- [x] T007 [US3] Update `addMember` in `src/features/members/application/member.service.ts` to call `generateInvitationChallenge` right after the shadow user is created and assigned to the tenant.
- [x] T008 [US3] Implement a backend API API route in `src/app/api/v1/users/invitations/route.ts` that receives `token` and `password`, fetches the challenge, updates the user's password (`bcrypt`), changes user status to `active`, and consumes the challenge.
- [x] T009 [US3] Create a new frontend page at `src/app/accept-invitation/page.tsx` that extracts the `token` from URL parameters, presents a "Set your password" form, and POSTs the payload to the API created in T008.
- [x] T010 [US3] Verify successful redirection to the main login (or auto-login) upon completing the setup.

**Checkpoint**: At this point, shadow users can fully activate their accounts.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements and validations that affect multiple user stories

- [ ] T011 Execute validation scenarios defined in `specs/002-add-shadow-members/quickstart.md` (requires running application with database)
- [X] T012 Code cleanup and ensure linting/formatting passes in all modified files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: N/A
- **User Stories (Phase 3+)**: US2 must be implemented before US1, as US1 relies on the backend capability to create shadow users. US3 relies on US2 to create the shadow user so that an invite can be delivered.
- **Polish (Final Phase)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 2 (P1)**: No dependencies on other stories. 
- **User Story 1 (P1)**: Depends on User Story 2.
- **User Story 3 (P1)**: Depends on User Story 2.

### Parallel Opportunities

- Due to the sequential nature of the service layer changes (T002 -> T003 -> T004), Phase 3 & 4 should be done sequentially.
- Phase 5 (US3 Backend vs Frontend) can be worked on in parallel (T008 vs T009).

---

## Implementation Strategy

### MVP First (User Story 2 + 1 + 3)

1. Complete Phase 3: User Story 2 (Service Layer)
2. Complete Phase 4: User Story 1 (API / UI Integration)
3. Complete Phase 5: User Story 3 (Invitation & Activation Flow)
4. **STOP and VALIDATE**: Run all scenarios in `quickstart.md`.
5. Deploy/demo if ready
