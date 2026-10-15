# engineering-paved-path

The paved path for building React, Next.js and Fastify applications: a set of skills that
tell Claude **where code goes, how it is shaped, how it is tested and how it is reviewed**,
plus a routing table that tells agents which of those skills own which files.

The skills are project-agnostic. Paths are described by role ("the frontend app root", "the
backend source root") and examples use a neutral ordering domain. Your project's own
conventions file (`AGENTS.md`, `CLAUDE.md`) wins where it names folders differently; the
rules still apply.

## Install

```bash
claude plugin install engineering-paved-path@dev-team-ai-engineering-marketplace
```

The plugin has no dependencies. It is installed automatically as a dependency of
`architecture-review` and `sdd-engineering`.

## Components

All components are skills. Claude loads a skill on its own when the task matches its
description; you can also call it by name.

| Skill | Area | Loaded at | How to invoke |
|---|---|---|---|
| `react-best-practices` | Frontend | write time | `/engineering-paved-path:react-best-practices` or "review this component for React anti-patterns" |
| `next-best-practices` | Frontend | write time | loaded automatically for Next.js work (not in the `/` menu: `user-invocable: false`) |
| `frontend-ui-architecture` | Frontend | write time | `/engineering-paved-path:frontend-ui-architecture` or "where should this hook go?" |
| `react-testing-library` | Frontend tests | write time | `/engineering-paved-path:react-testing-library` or "write tests for OrderForm" |
| `fastify-best-practices` | Backend | write time | `/engineering-paved-path:fastify-best-practices` or "add a Fastify route for invoices" |
| `onion-architecture` | Backend | write time | `/engineering-paved-path:onion-architecture` or "which ring does this file belong to?" |
| `security` | Full stack | **review time only** | `/engineering-paved-path:security` or "security-review this diff" |
| `skill-routing` | Agents | planning and review | `/engineering-paved-path:skill-routing [file paths...]` |

Other plugins refer to these skills by their namespaced name, for example
`engineering-paved-path:onion-architecture`, in agent `skills:` frontmatter and in prose. A
bare name (`onion-architecture`) is not resolved across plugins.

## Usage

### `react-best-practices`

How React code is written: component design, state, hooks misuse, effects, performance,
data fetching, React 19 patterns. Every rule carries a severity (CRITICAL / HIGH / MEDIUM)
that review agents map onto their report. Code pairs are in `examples.md`.

> "Refactor `CartSummary` — it syncs a derived total into state with `useEffect`."
> → the skill flags *derived state in an effect* (CRITICAL) and computes the total during render.

### `next-best-practices`

Next.js App Router mechanics: file conventions, RSC boundaries, async request APIs, data
patterns, metadata, error handling, route handlers, image and font optimisation, bundling,
scripts, hydration errors and self-hosting. One topic file per subject, read on demand.

> "Why does my `page.tsx` fail with 'async client component'?"
> → the skill points to the RSC-boundary rules: pages stay server components, the
> interactive leaf gets `'use client'`.

### `frontend-ui-architecture`

Where frontend code lives and what it may import: colocation, the promotion ladder (inline →
sibling → `_components` → feature → shared), the `shared → features → routes` layer model
with lint enforcement, component splitting, business-logic tiers, barrels, and App Router
organisation including the data access layer.

> "I need `formatMoney` in the checkout and in the invoices feature."
> → a second independent consumer: promote one rung, to the shared layer, as a util (it is
> domain-free). A `groupOrdersByStatus` helper would stay in its feature.

### `react-testing-library`

Fewer, longer, user-flow tests with React Testing Library and Vitest: a scenario matrix per
component type, query priority, `userEvent`, async patterns, MSW for network mocking, and an
anti-pattern table. Setup, full spec templates and the matcher reference are in
`references/`.

> "Write tests for `OrderForm`."
> → three flow tests: fill and submit → success; submit empty → validation errors; server
> error → message shown, form still filled.

### `fastify-best-practices`

Fastify rules, one file per topic under `rules/`: plugins and encapsulation, routes, JSON
Schema validation and serialization, hooks, error handling, authentication, CORS and
security headers, logging, TypeScript, testing with `inject()`, performance, WebSockets,
proxying and deployment.

> "Add `POST /invoices`."
> → route with a body schema and a response schema, registered in its plugin, tested with
> `app.inject()`.

### `onion-architecture`

Which ring a backend file belongs to and what it may import: Domain, Ports, Application,
Infrastructure, Transport + composition root; eleven numbered rules (framework types only
at the edge, queries only in repositories, SDKs only in adapters, validate once at the
boundary, constructor-injected ports, no cross-module reach-ins, ...). `references/` holds the
ring map, each rule with ✅/❌ examples, and sample ESLint and dependency-cruiser configs.

> "The orders route queries the database directly — is that OK?"
> → rule 2 violation: move the query into `modules/orders/repository.ts`, call it from
> `OrderService`, keep the route as transport.

### `security`

A review-time OWASP Top 10:2025 catalogue with **confidence-based reporting**: trace the
data flow, report only when a vulnerable pattern meets attacker-controlled input. Includes
severity classification, checklists and unsafe/safe example pairs.

> "Security-review the changes to the invoice download route."
> → checks ownership (IDOR), path handling and headers; reports HIGH-confidence findings
> with file, line, exploit and fix; stays silent on theoretical issues.

### `skill-routing`

The table agents use to decide which skills to load for which files. It maps file groups
(frontend components, App Router convention files, frontend tests, backend routes,
services, persistence, adapters, contracts, convention-only files) to skills, splits them
into write-time and review-time, normalises each skill's severity words to CRITICAL /
WARNING / SUGGESTION, and requires each skill to be loaded once per run.

```text
/engineering-paved-path:skill-routing web/src/features/orders/OrderForm.tsx api/src/modules/orders/routes.ts

web/src/features/orders/OrderForm.tsx → frontend → frontend-ui-architecture, react-best-practices
api/src/modules/orders/routes.ts      → backend-transport → onion-architecture, fastify-best-practices, security
write-time:  onion-architecture, fastify-best-practices, frontend-ui-architecture, react-best-practices
review-time: security
```

A project can replace the table with its own (see the skill's *Overriding the routing in a
project* section); `sdd-engineering` reads it from its `routing` setting.

## Write time vs review time

- **Write-time skills** (`react-best-practices`, `next-best-practices`,
  `frontend-ui-architecture`, `fastify-best-practices`, `onion-architecture`,
  `react-testing-library`) say where code goes and how it is shaped. Planners put them in a
  step's skill contract and implementers load them before writing.
- **Review-time skills** (`security`) grade a finished diff. Loading them while writing
  costs context and changes nothing about what gets typed, so implementers never load them;
  reviewers and gates do.
- `skill-routing` holds the split and the severity mapping, so planners, implementers and
  reviewers all read the same answer.

## Who depends on this plugin

| Plugin | Uses |
|---|---|
| `architecture-review` | its agent `architecture-review:architecture-reviewer` preloads `engineering-paved-path:onion-architecture` and `engineering-paved-path:frontend-ui-architecture` as its rulebook |
| `sdd-engineering` | the planner derives skill contracts from `engineering-paved-path:skill-routing`; the implementer loads the write-time skills by namespaced name; reviews use the severity mapping |

Renaming or removing a skill here is a breaking change: it requires a major version bump
and a widened dependency range in the plugins above.

## Limits

- **Advice, not enforcement.** The skills describe rules and sample configs; they never
  install linters, change your lint config or block a commit. Machine checks are your
  project's.
- **Stack-specific.** Written for React, Next.js (App Router), Fastify and TypeScript.
  Onion and frontend architecture generalise; the framework skills do not cover Vue,
  Express-only or NestJS idioms.
- **No ORM or schema-library skill.** Persistence and contracts route to
  `onion-architecture` only; add your own ORM / schema skill through a project routing table.
- **Security is a catalogue, not a scanner.** It does not run SAST tools or dependency
  audits, and it reports only what it can trace.
- **Never edits on its own.** No skill here writes files, commits or opens pull requests;
  they guide whoever is doing the work.

## Changes

See [CHANGELOG.md](CHANGELOG.md).
