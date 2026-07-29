# Research: Add Shadow Members

## Decision: Placeholder Password Hash
- **Decision**: Use `"!INVITED_USER!"` as the `passwordHash` for shadow users.
- **Rationale**: The `passwordHash` field is `NOT NULL`. By using a string that is not a valid bcrypt/argon2 hash (e.g. starts with `!`), we guarantee that standard authentication libraries will reject any login attempt. It also explicitly identifies the record as a shadow user.
- **Alternatives considered**: Modifying the database schema to allow `NULL` in `passwordHash` (rejected: would require a migration and add complexity for other flows).

## Decision: UUID Generation
- **Decision**: Use Node's standard `crypto.randomUUID()` for the new user ID.
- **Rationale**: Existing repositories (e.g., `provisioning.repository.ts`) already use `randomUUID()` from the `crypto` module.
- **Alternatives considered**: Database-side generation via `defaultRandom()` (not usable here since we need the ID in the same application transaction to create the membership).

## Decision: Email Normalization
- **Decision**: Normalize the email by doing `email.trim().toLowerCase()`.
- **Rationale**: This matches the logic already present in `findByUserEmail` in `member.repository.ts`.
- **Alternatives considered**: Exposing the internal normalizer function if one exists, but the trim/lowercase approach is simple and consistent with existing repository code.
