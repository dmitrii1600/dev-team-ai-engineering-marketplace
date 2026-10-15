---
name: skill-routing
description: >-
  Routing table that maps file groups (frontend components, Next.js App Router convention
  files, frontend tests, backend routes and handlers, services, persistence and repositories,
  adapters, schemas and contracts, convention-only files) to the engineering-paved-path skills
  that own them, split into write-time and review-time skills, with a mapping from each
  skill's own severity words to a CRITICAL / WARNING / SUGGESTION report scale. Used by
  planners, implementers and reviewers to decide which skills to load for which files: a
  planner derives a step's skill contract from the write-time column, an implementer loads
  those skills once per run, a reviewer loads the review-time set and normalises findings.
  Use when planning, building or reviewing a change and you need to know which skills apply
  to a list of files. A project may override the table with its own.
argument-hint: "[file paths...]"
---

# Skill routing

One table answers **"which skills own this file?"** for everyone in the chain: the planner
writing a skill contract, the implementer deciding what to load before a step, and the
reviewer grading a finished diff. Keeping it in one place means the three never disagree.

Paths are written by role, with example defaults. Resolve each role once per run from the
project's conventions file (`AGENTS.md`, `CLAUDE.md` or similar) or, failing that, from the
repository layout:

| Placeholder | Role | Example defaults |
|---|---|---|
| `<frontend-root>` | the frontend app root (the folder with the React / Next.js source) | `apps/web/src`, `web/src`, `frontend/src`, `src` in a single-app repo |
| `<backend-root>` | the backend source root | `apps/api/src`, `backend/src`, `api/src` |
| `<contracts-root>` | the schemas / contracts shared by API and clients | `<backend-root>/contracts`, `packages/contracts/src` |

When a role does not exist in the project (no backend, no Next.js), its rows simply never
match.

## How to apply it

Given a list of files (a plan's steps, a diff, or the arguments passed to this skill):

1. Classify each file into the **first** group below whose pattern matches. Tests are checked
   before source, convention-only before unrouted.
2. Collect the *Always* skills of the group, plus each *Conditionally* skill whose condition
   holds for that file.
3. Split the union into the write-time and review-time sets (see
   [Write-time vs review-time](#write-time-vs-review-time)).
4. Report any file that matched no group as **unrouted** (a WARNING), so the table gets
   extended rather than silently skipped.

When invoked directly with file paths, print one line per file (`path → group → skills`)
followed by the two deduplicated sets.

## Groups

| Group | Files | Always | Conditionally |
|---|---|---|---|
| **frontend-tests** | `<frontend-root>/**/*.{test,spec}.{ts,tsx,js,jsx}` | `engineering-paved-path:react-testing-library` | — |
| **app-router** | `<frontend-root>/**/app/**/{page,layout,loading,error,not-found,template,default,route,global-error}.{ts,tsx,js,jsx}`, `<frontend-root>/{middleware,proxy,instrumentation}.{ts,js}` | `engineering-paved-path:next-best-practices`, `engineering-paved-path:frontend-ui-architecture` | `engineering-paved-path:react-best-practices` when the file renders JSX (`.tsx` / `.jsx`) |
| **frontend** | `<frontend-root>/**/*.{ts,tsx,js,jsx}`, not tests, not generated or vendored code | `engineering-paved-path:frontend-ui-architecture`, `engineering-paved-path:react-best-practices` | `engineering-paved-path:next-best-practices` when the file contains `'use client'` / `'use server'` or imports `next/*` |
| **backend-transport** | `<backend-root>/**/routes.ts`, `<backend-root>/**/*.routes.ts`, `<backend-root>/{app,server}.ts`, framework plugins | `engineering-paved-path:onion-architecture` | `engineering-paved-path:fastify-best-practices` when the project uses Fastify · `engineering-paved-path:security` (review-time) always for route files |
| **backend-application** | `<backend-root>/**/service.ts`, `helpers.ts`, `constants.ts`, other use-case files in a module | `engineering-paved-path:onion-architecture` | — |
| **persistence** | `<backend-root>/**/repository*.ts`, `<backend-root>/**/*.repo.ts`, `<backend-root>/db/**` except migrations | `engineering-paved-path:onion-architecture` | the project's own ORM / database skill, if it routes one |
| **adapters** | `<backend-root>/adapters/**`, the composition root | `engineering-paved-path:onion-architecture` | `engineering-paved-path:security` (review-time) for auth, session, secrets, payment, file-upload and outbound-URL adapters · `engineering-paved-path:fastify-best-practices` for framework plugins |
| **contracts** | `<contracts-root>/**`, `<backend-root>/ports.ts` | `engineering-paved-path:onion-architecture` | `engineering-paved-path:security` (review-time) for auth payloads and anything that carries user-supplied URLs, HTML or file names |
| **convention-only** | end-to-end tests, backend tests, i18n message files, generated or vendored trees, `.github/**`, `.claude/**`, scripts, docs, specs, migrations, lockfiles, config files, every non-source extension | — (the project's machine checks and conventions file only) | — |
| **unrouted** | any other `.ts/.tsx/.js/.jsx/.mjs/.cjs` | — | reported as a WARNING so the table gets extended |

Why the groups are cut this way:

- **One skill per question.** `frontend-ui-architecture` (where code lives) and
  `react-best-practices` (how it is written) have explicit "does not cover X, see Y"
  boundaries; loading both on a component file is intended. Loading `next-best-practices` on
  a plain hook is noise, so it is conditional outside the App Router group.
- **`security` is targeted, not global.** Its own philosophy is confidence-based: it wants
  attacker-controlled input, which lives at the HTTP boundary, the auth / secrets / payment
  adapters and the contracts that carry user data. Everywhere else it produces LOW findings
  it tells you not to report.
- **Tests are their own group.** `react-testing-library` reviews tests; nothing else should
  judge a test file by component rules.
- **Convention-only files get no skill.** Migrations, configs and docs are governed by the
  project's own rules and checks; a code-style skill on them only adds noise.

## Write-time vs review-time

The table above names every skill that *reviews* a file. Not all of them help *write* one.
Implementers load only the write-time set; the review-time set is applied later, on the
finished diff, by a reviewer or a gate.

| Skill | Loaded | Why |
|---|---|---|
| `engineering-paved-path:onion-architecture`, `engineering-paved-path:frontend-ui-architecture`, `engineering-paved-path:react-best-practices`, `engineering-paved-path:next-best-practices`, `engineering-paved-path:fastify-best-practices`, `engineering-paved-path:react-testing-library` | **write-time** — from the plan's *Skill contract*, at the first step that needs it | they say where code goes and how it is shaped; without them the code is written wrong |
| `engineering-paved-path:security` | **review-time only** — the reviewer or gate, never the implementer | a long, confidence-based finding catalogue (attacker-controlled input traced to a sink). It grades a finished diff; loaded onto a blank file it costs hundreds of lines of context and changes nothing about what gets typed |

A planner derives each step's *Skill contract* from the **write-time** row only. A
`routes.ts` step therefore names `engineering-paved-path:onion-architecture` and
`engineering-paved-path:fastify-best-practices`, not `engineering-paved-path:security`; the
security review of that route still happens, at review time.

Architecture reviewers usually preload the two structure skills
(`engineering-paved-path:onion-architecture`, `engineering-paved-path:frontend-ui-architecture`)
regardless of the file list, because boundaries are their whole job.

### Load each skill once per run

A skill is loaded **once per run**, never once per step or per file. The `Skill` tool appends
the whole body to the context every time it is called, so loading
`engineering-paved-path:react-best-practices` for each of ten components costs ten copies of
the same text. Load the union up front (or at the first step that needs each skill) and keep
it for the rest of the run. Read a skill's `references/` files on demand, only for the
question at hand.

## Severity mapping

Skills speak different scales. A report that combines them normalises to three levels:
**CRITICAL** (must fix before merge), **WARNING** (should fix), **SUGGESTION** (optional).
A consumer with its own enum maps these three onto it.

| Skill says | Report severity |
|---|---|
| `engineering-paved-path:react-best-practices` **CRITICAL** | CRITICAL |
| `engineering-paved-path:react-best-practices` **HIGH** | WARNING |
| `engineering-paved-path:react-best-practices` **MEDIUM** | SUGGESTION |
| `engineering-paved-path:security` **HIGH** confidence (vulnerable pattern + attacker-controlled input confirmed) | CRITICAL |
| `engineering-paved-path:security` **MEDIUM** confidence (pattern, input source unclear) | WARNING |
| `engineering-paved-path:security` **LOW** confidence | do not report |
| `engineering-paved-path:onion-architecture` rules 1–11 (any, including the review-only rules 5, 6, 9, 11) | CRITICAL |
| `engineering-paved-path:onion-architecture` "Where do I put it?" table — wrong folder, still the right ring | WARNING |
| `engineering-paved-path:frontend-ui-architecture` — feature → feature import, shared layer importing a feature or the route layer, `fetch` in a component, hard-coded user-facing string, `process.env` read in a component | CRITICAL |
| `engineering-paved-path:frontend-ui-architecture` — promotion-ladder or placement smell, speculative shared, barrel file | WARNING |
| `engineering-paved-path:next-best-practices` — RSC boundary broken (`'use client'` on a page or layout, server-only import in a client file, async API used synchronously) | CRITICAL |
| `engineering-paved-path:next-best-practices` — metadata, image / font, bundling advice | SUGGESTION |
| `engineering-paved-path:fastify-best-practices` — missing route schema, `.parse()` in a handler, wrong plugin registration order | CRITICAL (these are also onion rule 6 territory) |
| `engineering-paved-path:fastify-best-practices` — everything else | SUGGESTION |
| `engineering-paved-path:react-testing-library` — asserting on implementation details, missing `await` on user events, `fireEvent` where `userEvent` fits | WARNING |
| any rule with no row above | SUGGESTION |

If a raw word slips through un-normalised, read `HIGH` as WARNING and `MEDIUM` / `LOW` /
`INFO` as SUGGESTION; drop any other value.

## Judgement checks a reviewer walks explicitly

Some rules have no machine check. Walk them per group; each is CRITICAL unless noted.

**backend** (`engineering-paved-path:onion-architecture`)
- Rule 5 — an ORM row type in a ring-2 public signature (`service.ts`, `helpers.ts`).
- Rule 6 — `Schema.parse(req.body)` in a handler instead of a declared route schema.
- Rule 9 — a new service taking the whole container instead of the ports it uses.
- Rule 11 — a new module without `service.ts` (+ `repository.ts` if it touches the database)
  and an entry in the module registry.
- A file whose name matches no lint zone, so no ring rule applies to it — WARNING.

**frontend** (`engineering-paved-path:frontend-ui-architecture`, `engineering-paved-path:next-best-practices`)
- `'use client'` on a page or layout rather than the smallest interactive leaf.
- `fetch` in a component instead of a data hook built on the single API module.
- A user-facing string literal in JSX instead of the i18n message files (when the project
  uses i18n).
- A hand-rolled primitive the project's shared UI layer already has — WARNING.
- A payload type re-declared locally instead of imported from the contracts — WARNING.

## Overriding the routing in a project

This table is a sensible default for a React / Next.js + Node backend. A project that needs
different globs, extra groups or skills from other sources can ship its own routing table:

- **Where.** Any Markdown file in the repository, for example `docs/skill-routing.md`.
  Consumers that support an override read it from their configuration — `sdd-engineering`,
  for instance, reads the `routing` input in `.claude/sdd-engineering.json` and falls back to
  this skill when it is unset.
- **Shape.** Keep the same sections so consumers can parse it the same way: *Groups* (group,
  files, always, conditionally), *Write-time vs review-time*, *Severity mapping* (a rule with
  no row = SUGGESTION) and the *load each skill once per run* rule.
- **Replace, do not merge.** A project table replaces this one wholesale; there is no
  per-row merge. To extend the defaults, copy this file and edit it.
- **Name every skill by its full name.** Skills from a plugin are written with their
  namespace (`engineering-paved-path:onion-architecture`, `<plugin>:<skill>`); a project's
  own skills under its skills folder use their bare name. A bare name for a plugin skill is
  silently not loaded when preloaded into an agent.
- **Use real paths.** A project table may and should use the project's concrete globs instead
  of the role placeholders above.

When a skill is added or removed from the project, update the table in the same change; an
unrouted file or a skill no group mentions is a WARNING in review.
