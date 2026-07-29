# Contract Evidence: 001 Multi-Tenant Base

Generated locally for producer and future `komanda-business` consumer compatibility.

- Producer fixture: `src/tests/contract/fixtures/komanda-business/provision-tenant.valid.json`
- Core contract: `specs/001-multi-tenant-base/contracts/openapi.yaml`
- Supported provisioning version: `2026-07-01`
- Plan authority: Core validates `planId`; the fixture never supplies entitlement content.
- Identity authority: Core issues and consumes the verification challenge.
- Payment authority: tenant Mercado Pago onboarding is OAuth-only.

Validation commands:

```bash
npm run test:contracts
```
