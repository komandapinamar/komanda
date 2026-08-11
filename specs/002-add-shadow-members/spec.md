# Feature Specification: Add Shadow Members

**Feature Branch**: `002-add-shadow-members`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "agrega estos cambios como parte de la spec 002 - agregar usuarios (no owners) desde la pantalla de members usando Shadow Users"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invite a New Member by Email (Priority: P1)

As a Tenant Owner, I want to add a new member by simply providing their email address, so that I can invite people to my tenant even if they don't have an existing account in the system.

**Why this priority**: Core functionality requested by the user to avoid "User not found" errors when trying to add unregistered users to a tenant.

**Independent Test**: Can be tested by adding an email address that is not in the system via the Members screen. A new row should appear without errors.

**Acceptance Scenarios**:

1. **Given** I am a Tenant Owner on the Members screen, **When** I enter a non-existing email and select "Employee" role, and click "Agregar", **Then** the member is successfully added to the tenant and appears in the list.
2. **Given** I am a Tenant Owner on the Members screen, **When** I enter an email that already exists in the system, **Then** the member is successfully added to the tenant and appears in the list.
3. **Given** I am a Tenant Owner, **When** I enter an email of someone who is already a member of this tenant, **Then** I receive an error stating the user is already a member.

---

### User Story 2 - Invited User Account Creation (Shadow User) (Priority: P1)

As the System, I need to create a placeholder account for invited members who don't exist, so that they can be linked to the tenant membership without requiring database schema changes to the membership table.

**Why this priority**: Required for the system to function using the chosen "Shadow User" architecture.

**Independent Test**: Can be verified by checking the database to ensure a user record is created with a placeholder password hash and "pending_verification" status when a new email is added via the Members screen.

**Acceptance Scenarios**:

1. **Given** an owner adds a non-existent email, **When** the system processes the request, **Then** a new user is created in the database with status `pending_verification` and a placeholder password hash (e.g., `!INVITED_USER!`) that cannot be logged into.
2. **Given** the shadow user is created, **When** the system creates the tenant membership, **Then** the membership is linked to the newly created shadow user's ID.

### User Story 3 - Accept Invitation and Set Password (Priority: P1)

As an Invited User (Shadow User), I want to receive an invitation email with a secure link so that I can set my own password, activate my account, and log into the system to access the tenant I was invited to.

**Why this priority**: Without this flow, shadow users remain permanently locked out and cannot actually use the system.

**Independent Test**: Can be tested by triggering the shadow user creation, intercepting the email verification token via the `capture` delivery adapter, visiting the specific frontend route to set the password, and verifying the user status changes to `active` and they can log in.

**Acceptance Scenarios**:

1. **Given** a new shadow user is created, **When** the system runs, **Then** an identity verification challenge is generated and an invitation email is dispatched (via `VerificationDelivery` port).
2. **Given** an invited user with an email link, **When** they click the link containing the token, **Then** a frontend UI prompts them to set a new password.
3. **Given** the user is viewing the set password prompt, **When** they submit a valid password, **Then** the backend consumes the token, sets the real password hash, changes their status to `active`, and logs them in (or redirects them to login).

### Edge Cases

- What happens when a shadow user tries to log in using standard authentication? (Should fail because the password hash is invalid).
- How does the system handle an invitation to an email that is in the middle of standard registration (if such flow exists)?
- What happens if the owner resends the invitation or adds the shadow user to a different tenant? (The shadow user already exists, so it behaves like adding an existing user).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow adding a member to a tenant using only an email and a role, regardless of whether the user exists in the system.
- **FR-002**: System MUST automatically create a "Shadow User" account when an unrecognized email is added as a member.
- **FR-003**: System MUST NOT allow login for "Shadow Users" until they have gone through an activation/password-reset flow. The placeholder password hash MUST be un-guessable and un-hashable.
- **FR-004**: System MUST assign the status `pending_verification` to newly created Shadow Users.
- **FR-005**: System MUST link the tenant membership to the newly created Shadow User's ID.
- **FR-006**: System MUST return a success response to the frontend when a member is added, whether they were an existing user or a newly created Shadow User.
- **FR-007**: System MUST generate an identity verification challenge and dispatch an invitation email (using existing `VerificationDelivery` infrastructure) when a Shadow User is created.
- **FR-008**: System MUST provide a frontend route (e.g., `/accept-invitation`) that consumes the token from the URL and presents a "Set Password" form.
- **FR-009**: System MUST provide a backend API endpoint to validate the token, update the user's password, and activate their account.
- **FR-010**: System MUST transition the user's status from `pending_verification` to `active` upon successful password setup.

### Key Entities

- **User**: Represents the user account. For shadow users, it will contain the invited email, a placeholder password hash, and a `pending_verification` status.
- **TenantMembership**: Links a User to a Tenant with a specific Role.
- **IdentityVerificationChallenge**: Represents a time-limited, single-use token that allows a user to verify their identity or set their initial password.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of emails submitted via the "Add Member" form result in a successful membership creation (assuming valid email format and not already a member).
- **SC-002**: 0 "User not found" errors occur when Tenant Owners try to invite new colleagues.
- **SC-003**: Shadow users cannot authenticate via standard login (0% unauthorized access).
- **SC-004**: Invited users successfully receive activation emails in the configured environment delivery mechanism.
- **SC-005**: Users who complete the activation flow can successfully log in with their newly set password.

## Assumptions

- We are using the "Option A: Shadow User" approach as decided by the user, meaning we will NOT modify the database schema for the `tenantMemberships` table.
- The activation flow re-uses the existing `identity-verification` service/infrastructure and the `VerificationDelivery` port, meaning no new third-party email integration needs to be added (it uses the currently active one, which captures to a file in dev/staging).
- The UI requires no significant changes beyond handling the success response properly instead of displaying a "User not found" error, and adding a new route for the invitation acceptance page.
