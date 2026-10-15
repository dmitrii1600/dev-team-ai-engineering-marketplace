---
name: onion-architecture
description: >-
  Onion Architecture for a TypeScript/Node backend — which ring a file belongs to and what it
  may import. Use whenever adding or changing backend code: a route, a service, a repository,
  an adapter, a DB query, a port interface, a new module, or a new external dependency. Use
  when deciding where a piece of logic goes, when a route handler is about to run a query,
  when a service is about to import the ORM, the HTTP framework or a vendor SDK, when
  something needs the composition root, or when a lint or boundary check fails with a ring
  message. Use when reviewing or refactoring backend structure, and whenever the question
  touches layering, dependency direction, ports and adapters, the composition root,
  repositories, DTO-vs-domain types, or module boundaries. Examples use Fastify, Drizzle and
  Zod but the rings apply to any stack. It does not cover how to write a Fastify route (see
  engineering-paved-path:fastify-best-practices) or frontend structure (see
  engineering-paved-path:frontend-ui-architecture).
---

# Onion Architecture

This skill answers one class of question: **which ring does this code live in, and what may
it import?** It says nothing about how to write a good route, a good query or a good schema —
`engineering-paved-path:fastify-best-practices`, your ORM's documentation and your schema
library's documentation own those, and duplicating them here would produce two sources of
truth that drift.

Most backends start onion-shaped and describe the shape in prose — *"everything external
goes through an adapter; a service that imports an SDK directly is a bug"*. Prose does not
fail a build, so the shape erodes at the edges. This skill turns that prose into rings,
eleven numbered rules, and two kinds of check that run: the linter (per-file import zones)
and a boundary checker (the import graph).

Companions, read on demand:

- **[references/layers.md](references/layers.md)** — the ring↔path map for the reference
  layout and the import matrix. Read it before placing a new file.
- **[references/rules.md](references/rules.md)** — the eleven rules, each with the why, a ✅
  and a ❌, and what checks it.
- **[references/enforcement.md](references/enforcement.md)** — sample lint and
  dependency-cruiser configs, how to read a failure, the grandfathered-list mechanism, and
  how to add an exception.

## The one rule

> All code can depend on layers more central, but code cannot depend on layers further out
> from the core. — Palermo, 2008

Everything below is a consequence. Outer may skip inward (a route may call a port
directly); inward may never reach outward. When you are unsure which ring something is in,
ask what would break it: if a file breaks when the database, the HTTP framework or an SDK
changes, it is infrastructure, however business-like it reads.

---

## Paths are described by role

This skill never assumes a folder name. It talks about:

| Role | Meaning | Typical defaults |
|---|---|---|
| **the backend source root** | the directory that holds the API's source | `src/` of the API package (`apps/api/src`, `backend/src`, `api/src`) |
| **the domain core** (optional) | a pure package with no I/O — business rules shared by several entrypoints | a `core/` or `domain/` package |
| **the contracts module** | request/response schemas shared by the API and its clients | `<backend-root>/contracts/` or a shared package |

The paths in this skill and its references are **the reference layout**, relative to the
backend source root: `modules/<name>/{routes,service,repository,helpers,constants}.ts`,
`adapters/<concern>/<tech>.ts`, `db/`, `platform/`, `ports.ts`. If the project's conventions
file (`AGENTS.md`, `CLAUDE.md` or similar) names the folders differently, use its names —
the rings and the rules do not change, only the globs.

---

## The rings

| Ring | Name | Lives in (reference layout) | May import |
|---|---|---|---|
| 0 | **Domain** | the domain core, `contracts/**` | nothing from the rest of the backend |
| 1 | **Ports** | `ports.ts` (or `ports/**`): outbound interfaces such as `PaymentGateway`, `Mailer`, `SecretsProvider` | ring 0 |
| — | *Kernel* | `platform/config.ts`, `platform/errors.ts` | any ring may import these |
| 2 | **Application** | `modules/*/service.ts` · `helpers.ts` · `constants.ts` · pure application services in `platform/` | rings 0–1 |
| 3 | **Infrastructure** | `adapters/**` · `db/**` · `modules/*/repository*.ts` · I/O-backed platform services (job queue, event bus, template loader) | rings 0–1 + its own technology |
| 4 | **Transport + composition root** | `modules/*/routes.ts` · `modules/index.ts` · `app.ts` · `server.ts` · `platform/container.ts` · the shared request-context helper | every ring |

Two placements surprise people, so they are stated here rather than buried:

- **The composition root (`platform/container.ts`) is ring 4, not ring 3.** It is the one
  file allowed to name every concrete class, which is exactly why it may import `modules/**`
  and nothing else in `platform/` may. A file that reaches for the container to fetch a
  dependency is doing service location; the container exists to *hand* dependencies out at
  the edge.
- **Generated or vendored trees are often in the linter's `ignores`.** If any part of rings
  0–1 lives there (generated contracts, a vendored shared package), no lint zone can ever
  fire on it, so those rings must be policed by the boundary checker instead. Do not "fix"
  this by un-ignoring a generated tree.

---

## The eleven rules

One line each; the why, the examples and the check are in
[references/rules.md](references/rules.md).

| # | Rule | Checked by |
|---|---|---|
| 1 | HTTP framework types (`fastify`, `express`, …) only in ring 4. The shared request-context helper is the one named exception. | lint |
| 2 | The ORM / query builder, the DB schema and the DB client only in ring 3. A route that queries is the failure mode this skill exists to stop. | lint |
| 3 | A vendor SDK (`stripe`, `@aws-sdk/*`, `openai`, `octokit`, `nodemailer`, …) only in `adapters/**`. | lint |
| 4 | `node:fs`, `node:child_process` only in ring 3. | lint |
| 5 | An ORM row type (e.g. Drizzle `$inferSelect`) must not appear in a ring-2 public signature — map row → contract in `helpers.ts`. | review |
| 6 | Validate once, at the boundary. The route carries the schema; handlers do not call `Schema.parse(req.body)`. | review |
| 7 | A contract is a wire DTO, not a domain model. Ring 2 may use a `z.infer` *type*; importing the schema library in ring 2 to re-parse means the validation is in the wrong place. | lint (import), review (intent) |
| 8 | Everything external is a port resolved from the composition root; tests swap in mocks through an overrides object. | lint |
| 9 | A new service takes the ports it needs in its constructor, not the whole container. | review |
| 10 | `adapters/**` may not import `db/**` or `modules/**`; `platform/**` (except the composition root) may not import `modules/**`; a module may not import another module's folder — cross-module access goes through the composition root. | boundary checker |
| 11 | A new module = `routes.ts` + `service.ts`, plus `repository.ts` when it touches the database, plus one entry in the module registry. | review |

---

## Where do I put it?

| You are adding | It goes in | Not in |
|---|---|---|
| A SQL query, any `db.select()` | `modules/<name>/repository.ts` (ring 3) | the route, the service |
| A business decision, an orchestration, a policy | `modules/<name>/service.ts` (ring 2) | the route |
| A pure transform (row → DTO, formatting, rollup) | `modules/<name>/helpers.ts` (ring 2) | inline in either |
| A call over the network or to the disk | a new `adapters/<concern>/<tech>.ts` behind an interface (ring 3 + ring 1) | anywhere else |
| A new interface for that call | `ports.ts` (ring 1) | next to the implementation |
| Wiring the implementation to the interface | the composition root + its overrides type + a mock in `adapters/mocks.ts` | a module |
| A request/response shape | the contracts module (ring 0), used as the route schema | a hand-written type in the module |
| A magic string or number | `modules/<name>/constants.ts` | inline |
| Pure business rules shared by several entrypoints (API, worker, CLI) | the domain core (ring 0) | a service that only the API can reach |

---

## When *not* to add a layer

Onion is a way to pay for change you expect. Paid where change never comes, it is ceremony.
The bar:

- **A repository that only forwards one call is still worth it**, because it is the seam the
  ring-2 rule depends on: a service must be readable without knowing SQL. But do not invent
  a second repository for a second table in the same module — one per module, split into
  `repository/*.repo.ts` by entity only when it grows.
- **Do not write an interface with one implementation and no test double.** A port earns its
  existence when something is injected in a test or swapped in an environment. A
  `PaymentGateway` or a `Clock` qualifies; an `IOrderNumberFormatter` would not.
- **Do not build a separate domain-entity class layer** when the project deliberately uses
  its schema contracts as the shared model (one definition serving request validation,
  response serialization and the client's type). Rule 7 protects the direction of that
  dependency, not a second set of types.
- **Do not restructure a module into `domain/application/infrastructure` folders.** In the
  reference layout the ring is derived from the filename, on purpose — see
  [references/layers.md](references/layers.md).

The test for every abstraction: *does it let a ring-2 file be read, and tested, without
knowing which technology is underneath?* If no, it is decoration.

---

## Two checks

```sh
<the project's lint command>        # ring rules the linter can see (imports, per-file zones)
<the project's boundary checker>    # ring rules it cannot: cycles, ignored trees, cross-module reach-ins
```

The boundary checker is a graph tool such as dependency-cruiser or eslint-plugin-boundaries.
Both must be green before a commit. When one fails, the message should name the ring and
point back to this skill. Fix the placement — reach for an exception only under the rules in
[references/enforcement.md](references/enforcement.md), and never by deleting the rule.

If the project has neither check yet, the sample configs in
[references/enforcement.md](references/enforcement.md) are a starting point; until then,
every rule is review-only and the checklist below is the only guard.

---

## Before you finish

- [ ] Every new file has a ring, and it matches its filename ([references/layers.md](references/layers.md))
- [ ] No ORM / DB schema import outside ring 3
- [ ] No HTTP framework import outside ring 4
- [ ] No vendor SDK outside `adapters/**`; a new external call has an interface, a
      composition-root entry and a mock
- [ ] No ORM row type in a service's public signature
- [ ] The route declares its schema; no `.parse()` in the handler
- [ ] Cross-module access goes through the composition root, not another module's folder
- [ ] A new module has `routes.ts` + `service.ts` and one line in the module registry
- [ ] The lint command and the boundary checker are green — no new entry in the
      grandfathered list
- [ ] Anything learned the hard way is recorded where the project keeps its engineering notes
