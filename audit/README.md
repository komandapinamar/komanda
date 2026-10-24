# Full Repository Audit

This audit reviews the current checked-out repository state instead of a pull-request diff.

## What it checks

- hard-coded credentials and secrets
- ESLint
- TypeScript
- npm dependency vulnerabilities
- Semgrep OWASP Top 10
- semantic review with an OpenAI model
- correctness, security, tenant isolation, architecture, performance, maintainability and testing risks

## GitHub setup

Add:

- Repository secret: `OPENAI_API_KEY`
- Repository variable: `AUDIT_MODEL`

The workflow can also run without `OPENAI_API_KEY`; deterministic checks and the report still run.

## Execution

- automatically on pushes to `main`
- weekly on Monday
- manually from Actions → Full repository audit

The generated report is uploaded as a workflow artifact and is not committed back into `main`.

## Security note

The audit is read-only. It does not automatically modify source code or create issues.

If a credential is detected, rotate/revoke it separately. Removing the current value from a file does not invalidate a credential that was already exposed in git history.
