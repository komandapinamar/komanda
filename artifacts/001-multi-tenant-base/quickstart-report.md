# Quickstart Report

## Local execution

Executed from `src/` on 2026-07-18:

| Command | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npx drizzle-kit check` | passed |
| `npm test` | 26 files passed, 57 tests passed, 5 skipped |
| `npm run test:unit` | 3 files passed, 11 tests passed |
| `npm run test:tenant-isolation` | 6 files passed, 13 tests passed, 2 skipped |
| `npm run test:contracts` | 7 files passed, 11 tests passed |
| `npm run test:database-compatibility` | 1 file passed, 1 skipped |
| `npm run build` | passed; only versioned tenant-aware routes were generated |

## Not executed locally

- `db:migrate:test` and runtime-role verification require PostgreSQL credentials.
- Neon compatibility requires the synthetic development database.
- Azure staging, OpenTofu apply, private network access and restore validation require the staging environment.
- Mercado Pago OAuth/webhook sandbox validation requires provider credentials.
- Playwright acceptance journeys remain environment-gated until the database and service fixtures are configured.

This report records repository-local validation only. It is not production approval.
