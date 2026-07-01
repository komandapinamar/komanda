<!--
Sync Impact Report
- Version change: unratified template -> 1.0.0
- Principles established:
  - I. Explicit Repository Ownership
  - II. Independent Delivery and Fault Containment
  - III. Contract-First and Mobile-Ready Core
  - IV. Tenant Isolation and Authoritative Data
  - V. Measurable Performance and Operational Quality
- Sections established:
  - Architecture and Operational Boundaries
  - Development Workflow and Quality Gates
- Removed sections: none; template placeholders were replaced by ratified content.
- Dependent artifacts:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
  - ✅ updated: README.md
  - ➖ not present: .specify/templates/commands/
- Follow-up:
  - ⚠ Mirror this constitution and its relevant templates in the Acquisition
    repository when that repository is created.
  - ⚠ Specifications created before 2026-07-01 must pass the new Constitution
    Check before implementation planning begins.
-->
# Komanda Constitution

## Core Principles

### I. Explicit Repository Ownership

Komanda MUST be divided into two product repositories with one accountable owner
for every capability:

- The **Acquisition repository** MUST own the Astro public site, commercial plan
  presentation, gastronomic-business registration experience, acquisition content,
  and acquisition analytics.
- The **Core repository** MUST own the existing Next.js product: tenant storefronts,
  the business-administration application, authentication and memberships, tenant
  provisioning, catalog management, checkout, orders, payments, printing, and the
  authoritative operational data.

A concept MUST have exactly one source of truth. Cross-repository features MUST name
the owning repository, the consuming repository, and the contract between them.
Neither repository may copy the other's business rules or access the other's data
store directly. The registration form belongs to Acquisition; the indivisible
creation of account, tenant, initial location, and owner membership belongs to Core.

Rationale: visual separation without ownership rules only moves coupling between
codebases. Explicit ownership prevents divergent plan, registration, and tenant
rules.

### II. Independent Delivery and Fault Containment

Each repository MUST have its own build, deployment, rollback, runtime configuration,
health checks, and release cadence. A release in one repository MUST NOT require a
simultaneous release in the other unless a documented, versioned migration sequence
provides backward compatibility throughout the rollout.

The public marketing and plan content MUST remain available when Core is unavailable.
Existing storefront, checkout, and administration flows MUST remain available when
Acquisition is unavailable. If tenant provisioning cannot be completed, Acquisition
MUST NOT claim that registration succeeded or leave a partial tenant; it MUST show a
retryable state and MAY retain a consented registration intent for later retry.

Every plan MUST identify shared infrastructure and external services that can still
form a common failure domain. Repository separation alone MUST NOT be presented as
eliminating single points of failure.

Rationale: the split exists to reduce deployment blast radius and operational
coupling, not merely to organize source files.

### III. Contract-First and Mobile-Ready Core

All communication from Acquisition, web clients, integrations, and future mobile
clients to Core MUST use documented and versioned service contracts. Cross-repository
database access, importing private server modules across repositories, and depending
on Next.js Server Actions as the only interface are prohibited.

Core business rules MUST live in framework-independent application or domain services.
Next.js routes, Server Actions, web components, and future Expo clients MUST remain
adapters around those services. Contracts, portable validation, domain types, and
client libraries MAY be shared as independently versioned packages only when they do
not depend on browser, Next.js, Astro, or native UI runtimes.

Contract changes MUST be backward compatible or introduced under a new version with
a migration and retirement window. Producer and consumer contract tests are mandatory
for registration, authentication, tenant selection, catalog, carts, orders, payments,
and any contract intended for mobile use.

Rationale: Expo or another mobile framework must become another client of Komanda,
not a second implementation of its operational rules.

### IV. Tenant Isolation and Authoritative Data

Core MUST be the system of record for users, tenants, memberships, locations,
entitlements, catalogs, carts, payments, orders, and printing. Every tenant-owned
record, operation, background job, external callback, and credential lookup MUST have
an explicit and verified tenant context. Missing or ambiguous context MUST fail closed;
global or initial-tenant fallback is prohibited.

Authorization MUST be enforced on the server for every protected operation, regardless
of tenant identifiers supplied by a URL, host, client, or external integration. New or
changed tenant-aware functionality MUST include tests with at least two tenants that
cover reads, writes, identifiers, asynchronous processing, and cross-tenant denial.

Catalog data currently held in Strapi MUST migrate into Core before Strapi is removed.
After cutover, Strapi MUST NOT remain an operational dependency for storefront or
administration flows.

Rationale: tenant isolation is a security and correctness boundary, not a query
convention left to individual features.

### V. Measurable Performance and Operational Quality

Acquisition MUST be static-first and use client-side code only for interactions that
require it. Marketing and plan pages MUST expose useful content without depending on
Core at render time. Every Acquisition plan and release MUST declare and measure a
page-weight budget, time-to-usable target, and registration completion target; an
unapproved regression blocks release.

Core plans MUST declare measurable targets for the affected customer and administrator
journeys. Critical registration, tenant-isolation, checkout, payment, order, and print
flows MUST have automated contract or integration coverage. Cross-repository calls and
external side effects MUST define timeout, retry, idempotency, and degraded-mode
behavior where applicable.

Both repositories MUST emit actionable diagnostics for their owned operations without
exposing credentials or tenant data. Logs and traces for cross-repository requests MUST
carry a correlation identifier and, when applicable, a safe tenant identifier.

Rationale: speed, fault isolation, and client compatibility are release properties
that require evidence, not architectural intentions.

## Architecture and Operational Boundaries

The target system consists of these independently deployable surfaces:

- **Acquisition / Astro (`komanda.com`)**: public landing, SEO content, commercial plan
  catalog and pricing presentation, gastronomic-business signup form, and acquisition
  analytics. It owns the registration journey but requests authoritative provisioning
  from Core through a versioned contract.
- **Core administration / Next.js (`app.komanda.com`)**: login, session establishment,
  onboarding, business selection, plan entitlement enforcement, dashboard, catalog
  administration, order operations, and business configuration.
- **Core storefront / Next.js (`{tenant}.komanda.com`)**: public tenant identity,
  catalog, cart, checkout, payment result, and customer-facing order flow. All tenants
  share the same deployment and code; configuration and data determine behavior.
- **Future mobile client**: an Expo or equivalent application that consumes the same
  versioned Core contracts. It MUST NOT connect directly to the database or require
  web-only components, cookies, or Server Actions to execute business capabilities.

Commercial plan definitions and public presentation belong to Acquisition. Core MUST
receive a versioned plan identifier and enforce the resulting entitlement snapshot for
each tenant. Changes to plan identifiers or entitlements are contract changes and MUST
follow the compatibility rules in Principle III.

Acquisition and Core MUST NOT share a writable database. Acquisition may own storage
for public content, analytics, or consented pending registration intents. Operational
identity and tenant data remain exclusively in Core.

The current repository is the Core repository in transition. Its target includes the
catalog and administration capabilities that replace Strapi. The Acquisition
repository will be created and deployed separately.

## Development Workflow and Quality Gates

Every feature specification MUST identify:

1. The owning repository and any secondary repository affected.
2. The source of truth for every new or changed concept.
3. Cross-repository or client contract changes and compatibility expectations.
4. Behavior when either repository or an external dependency is unavailable.
5. Tenant-isolation impact and required two-tenant acceptance scenarios.
6. Reuse requirements for future mobile clients or an explicit statement that none
   apply.
7. Measurable performance and operational outcomes for affected journeys.

Every implementation plan MUST pass the Constitution Check before research and again
after design. A failed gate requires an explicit entry in Complexity Tracking with the
reason, rejected compliant alternative, owner, and removal or migration plan.

Delivery MUST include the tests mandated by the affected principles. Contract changes
require producer and consumer tests. Tenant changes require positive and negative
multi-tenant tests. Acquisition changes require performance evidence. Stateful changes
require migration, reconciliation, and rollback procedures. Each repository's pipeline
MUST be able to validate and deploy its part independently.

Pull requests MUST state which constitutional gates apply and provide evidence for
each one. Reviewers MUST reject changes that move logic across repository boundaries,
introduce direct cross-repository data access, weaken tenant isolation, or make a web
adapter the only reusable business interface.

## Governance

This constitution supersedes informal architecture notes and implementation
convenience. Amendments require a documented proposal describing the motivation,
affected repositories, migration impact, and updates required in dependent templates
and runtime guidance.

Versions follow semantic versioning:

- **MAJOR**: removes or incompatibly redefines a principle or ownership boundary.
- **MINOR**: adds a principle, mandatory gate, or materially expands governance.
- **PATCH**: clarifies wording without changing obligations.

Every amendment MUST update the Sync Impact Report, version, and last-amended date.
The ratification date remains the original adoption date. The constitution in this
repository is canonical until a shared governance location exists; once the
Acquisition repository is created, relevant constitutional changes MUST be mirrored
there in the same change process.

Compliance is reviewed during specification, planning, task generation, and pull
request review. Exceptions MUST be explicit, temporary, approved by the project owner,
and tracked with a concrete remediation condition. Silent exceptions are prohibited.

**Version**: 1.0.0 | **Ratified**: 2026-07-01 | **Last Amended**: 2026-07-01
