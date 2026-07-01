<!--
Sync Impact Report
- Version change: 1.0.0 -> 2.0.0
- Modified principles:
  - I. Explicit Repository Ownership -> I. Core Ownership and Authority
  - II. Independent Delivery and Fault Containment -> II. Independent Core Delivery
  - III. Contract-First and Mobile-Ready Core -> III. Versioned Client Contracts
  - IV. Tenant Isolation and Authoritative Data -> IV. Tenant Isolation and Authoritative Data
  - V. Measurable Performance and Operational Quality -> V. Measurable Core Quality
- Removed from this constitution:
  - Acquisition site ownership, content, plan presentation, registration UX, and analytics
  - Acquisition static-first delivery and page-performance requirements
  - Acquisition behavior while Core provisioning is unavailable
- Dependent artifacts:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
  - ✅ updated: README.md
  - ➖ not present: .specify/templates/commands/
- Follow-up:
  - ✅ Acquisition-specific governance moved to komanda-business at version 1.0.0
  - ⚠ Specifications created before 2026-07-01 must pass this Core-only
    Constitution Check before implementation planning begins.
-->
# Komanda Core Constitution

## Core Principles

### I. Core Ownership and Authority

This repository MUST own Komanda's operational product: tenant storefronts,
business administration, authentication and memberships, tenant provisioning,
catalog management, checkout, carts, orders, payments, printing, and authoritative
multi-tenant data.

Every operational concept MUST have exactly one source of truth in Core. Clients and
external repositories MUST interact with Core through documented contracts; they MUST
NOT copy Core business rules, import private server modules, or access the Core data
store directly. Account, tenant, initial location, and owner-membership provisioning
MUST remain one indivisible Core operation.

Rationale: operational ownership must remain centralized so that data, authorization,
and transactional rules cannot diverge between clients.

### II. Independent Core Delivery

Core MUST have its own build, deployment, rollback, runtime configuration, health
checks, and release cadence. A Core release MUST NOT require a simultaneous client or
external-repository release unless a documented, backward-compatible migration
sequence covers the complete rollout.

Storefront, checkout, and administration flows MUST remain available when an
external acquisition or content client is unavailable. Every plan MUST identify
shared infrastructure and external services that remain common failure domains and
define observable degraded behavior for each affected Core journey.

Rationale: Core must protect operational continuity and limit the blast radius of
changes made by independently deployed clients.

### III. Versioned Client Contracts

All web clients, external repositories, integrations, and future mobile clients MUST
use documented and versioned Core service contracts. Depending on Next.js Server
Actions as the only interface to a business capability is prohibited.

Core business rules MUST live in framework-independent application or domain
services. Next.js routes, Server Actions, web components, background processors, and
future clients MUST remain adapters around those services. Portable validation,
domain types, and client libraries MAY be published as independently versioned
packages only when they do not depend on a UI or web framework.

Contract changes MUST be backward compatible or introduced under a new version with
a migration and retirement window. Producer contract tests are mandatory for
registration, authentication, tenant selection, catalog, carts, orders, payments,
printing, and every contract intended for external or mobile consumption.

Rationale: each client must consume one authoritative implementation rather than
reimplement operational behavior.

### IV. Tenant Isolation and Authoritative Data

Core MUST be the system of record for users, tenants, memberships, locations,
entitlements, catalogs, carts, payments, orders, and printing. Every tenant-owned
record, operation, background job, external callback, and credential lookup MUST have
an explicit and verified tenant context. Missing or ambiguous context MUST fail
closed; global or initial-tenant fallback is prohibited.

Authorization MUST be enforced on the server for every protected operation,
regardless of tenant identifiers supplied by a URL, host, client, or integration. New
or changed tenant-aware functionality MUST include tests with at least two tenants
covering reads, writes, identifiers, asynchronous processing, and cross-tenant
denial.

Catalog data currently held in Strapi MUST migrate into Core before Strapi is removed.
After cutover, Strapi MUST NOT remain an operational dependency for storefront or
administration flows.

Rationale: tenant isolation is a security and correctness boundary, not a query
convention left to individual features.

### V. Measurable Core Quality

Every Core plan MUST declare measurable targets for affected customer,
administrator, integration, and background-processing journeys. Critical
registration provisioning, tenant-isolation, checkout, payment, order, and printing
flows MUST have automated contract or integration coverage.

External calls and side effects MUST define timeout, retry, idempotency, and
degraded-mode behavior where applicable. Core MUST emit actionable diagnostics for
owned operations without exposing credentials, customer data, or unsafe tenant data.
Cross-boundary requests MUST carry a correlation identifier and, when applicable, a
safe tenant identifier.

Rationale: reliability, performance, and client compatibility are release properties
that require measurable evidence.

## Architecture and Operational Boundaries

This repository contains these independently testable Core surfaces:

- **Administration / Next.js (`app.komanda.com`)**: login, sessions, onboarding,
  business selection, entitlement enforcement, dashboard, catalog administration,
  order operations, and business configuration.
- **Tenant storefront / Next.js (`{tenant}.komanda.com`)**: tenant identity, catalog,
  cart, checkout, payment result, and customer-facing order flow. All tenants share
  one deployment; explicit configuration and data determine behavior.
- **Versioned Core API**: provisioning and operational capabilities consumed by web,
  integrations, external repositories, and future mobile clients.
- **Background and printing services**: tenant-scoped payment processing, jobs,
  printing queues, and local print-agent contracts.

Public acquisition content, commercial plan presentation, registration-form UX, and
acquisition analytics are outside this repository. Core MAY receive a versioned plan
identifier or provisioning request, but it MUST validate that input and enforce the
resulting entitlement snapshot itself.

External repositories and Core MUST NOT share a writable database. Operational
identity, tenant data, credentials, and transactional records remain exclusively in
Core. Future mobile clients MUST NOT connect directly to the database or require
web-only components, cookies, or Server Actions to execute business capabilities.

## Development Workflow and Quality Gates

Every feature specification MUST identify:

1. The Core capability and authoritative source of truth being changed.
2. Affected web, external, integration, background, or mobile consumers.
3. Contract changes and compatibility expectations.
4. Behavior when an external repository or dependency is unavailable.
5. Tenant-isolation impact and required two-tenant acceptance scenarios.
6. Reuse requirements for future clients or an explicit statement that none apply.
7. Measurable performance, reliability, and operational outcomes.

Every implementation plan MUST pass the Constitution Check before research and again
after design. A failed gate requires an explicit Complexity Tracking entry with the
reason, rejected compliant alternative, owner, and removal or migration plan.

Delivery MUST include producer tests for changed contracts, positive and negative
multi-tenant tests for tenant-aware changes, and migration, reconciliation, and
rollback procedures for stateful changes. The Core pipeline MUST validate and deploy
this repository independently.

Pull requests MUST state which constitutional gates apply and provide evidence for
each one. Reviewers MUST reject changes that move operational logic into clients,
introduce direct external data access, weaken tenant isolation, or make a web adapter
the only reusable business interface.

## Governance

This constitution supersedes informal architecture notes and implementation
convenience for the Core repository. Amendments require a documented proposal
describing the motivation, affected consumers, migration impact, and updates required
in dependent templates and runtime guidance.

Versions follow semantic versioning:

- **MAJOR**: removes or incompatibly redefines a principle or ownership boundary.
- **MINOR**: adds a principle, mandatory gate, or materially expands governance.
- **PATCH**: clarifies wording without changing obligations.

Every amendment MUST update the Sync Impact Report, version, and last-amended date.
The ratification date remains the original adoption date. Amendments that change a
cross-repository boundary MUST identify and coordinate the corresponding consumer
constitution or contract update; unrelated governance evolves independently.

Compliance is reviewed during specification, planning, task generation, and pull
request review. Exceptions MUST be explicit, temporary, approved by the project
owner, and tracked with a concrete remediation condition. Silent exceptions are
prohibited.

**Version**: 2.0.0 | **Ratified**: 2026-07-01 | **Last Amended**: 2026-07-01
