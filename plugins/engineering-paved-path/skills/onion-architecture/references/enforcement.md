# Enforcement

Two kinds of check, both required before a commit:

```sh
<the project's lint command>        # per-file import zones (e.g. ESLint no-restricted-imports)
<the project's boundary checker>    # the import graph (e.g. dependency-cruiser, eslint-plugin-boundaries)
```

Keep them separate on purpose: a structural failure should not read like a style failure.
The linter is also what fires in the editor, so ring violations surface while you type.

## Why this split

ESLint sees one file at a time and matches on the *import specifier*, which is exactly right
for "a service may not import the ORM" and useless for "these two folders must not form a
cycle". dependency-cruiser resolves the graph, follows the tsconfig `paths` aliases, and can
express a back-reference (`modules/a` may not import `modules/<anything but a>`). Neither tool
alone covers the eleven rules; together they cover most of them, and the rest (rules 5, 6, 9
and 11 — row types in a signature, hand-rolled `.parse()`, service location, module shape)
are type-level or judgement calls, so they stay review-only.

One constraint often drives the split as much as capability: generated or vendored trees are
usually in the linter's `ignores`, so no lint rule can protect a ring that lives there. A
graph rule such as `contract-stays-pure` is then the only thing guarding the innermost rings.

**Prefer a tool you already have.** If the backend already depends on dependency-cruiser (or
the frontend already runs eslint-plugin-boundaries), reuse it rather than adding a second
graph tool.

---

## What lives where

| Rule | Check | Mechanism |
|---|---|---|
| 1 HTTP framework outside ring 4 | lint | `no-restricted-imports` on the ring-2 and ring-3 zones |
| 2 persistence outside ring 3 | lint | same, plus the `routes.ts` zone |
| 3 vendor SDK outside `adapters/**` | lint | same, on every zone |
| 4 `node:fs` / `child_process` outside ring 3 | lint | same |
| 5 row type in a ring-2 signature | review | a type in a signature is not an import |
| 6 `.parse()` in a handler | review | — |
| 7 schema library imported by ring 2 | lint | restricted import that allows type-only imports |
| 8 ring 2 importing an adapter | lint | `**/adapters/**` pattern |
| 9 service taking the whole container | review (partly graph: `adapter-not-to-container`) | — |
| 10 sideways / outward folder edges | boundary checker | `adapter-not-to-db`, `adapter-not-to-feature`, `platform-not-to-feature`, `no-cross-module-reach-in` |
| 11 module missing a service | review | — |
| (bonus) cycles, dev-dependency leaks, pure contracts and ports | boundary checker | `no-circular`, `not-to-dev-dep`, `contract-stays-pure`, `port-stays-pure` |

---

## Sample lint zones (ESLint flat config)

Paths assume the reference layout under `src/`; adapt the globs to the project's names. Every
message names the rule and points back to this skill, so a failure explains itself.

```js
// eslint.config.js (excerpt)
const RING2 = ['src/modules/*/service.ts', 'src/modules/*/helpers.ts', 'src/modules/*/constants.ts'];

const http    = { group: ['fastify', 'fastify/*', '@fastify/*'],
                  message: 'Rule 1 — HTTP types are ring 4. Pass plain arguments (onion-architecture).' };
const persist = { group: ['drizzle-orm', 'drizzle-orm/*', '**/db/schema*', '**/db/client*'],
                  message: 'Rule 2 — persistence is ring 3. Move the query into modules/<name>/repository.ts and inject it (onion-architecture).' };
const sdks    = { group: ['stripe', '@aws-sdk/*', 'nodemailer', 'openai', 'pg', 'postgres'],
                  message: 'Rule 3 — vendor SDKs live in adapters/** behind a port (onion-architecture).' };
const io      = { group: ['node:fs', 'node:fs/*', 'fs', 'node:child_process', 'child_process'],
                  message: 'Rule 4 — filesystem and processes are ring 3 (onion-architecture).' };
const adapter = { group: ['**/adapters/**'],
                  message: 'Rule 8 — depend on the port in ports.ts, not the adapter (onion-architecture).' };

export default [
  // ring 2: application
  { files: RING2,
    rules: { 'no-restricted-imports': ['error', { patterns: [http, persist, sdks, io, adapter] }] } },
  // ring 4 transport: routes may use the framework, but not the database
  { files: ['src/modules/*/routes.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [persist, sdks, io] }] } },
  // ring 3 outside adapters: repositories may use the ORM, but no SDKs or framework
  { files: ['src/modules/*/repository.ts', 'src/modules/*/repository/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [http, sdks] }] } },
];
```

For rule 7, use `@typescript-eslint/no-restricted-imports` on the ring-2 zone with
`{ group: ['zod'], allowTypeImports: true }`: a `z.infer` type stays legal, a runtime
`import { z } from 'zod'` does not. Core ESLint's rule cannot tell the two apart.

Note that `no-restricted-imports` matches the **import specifier as written**, so
`**/db/schema*` catches `'../../db/schema.js'`; it never sees a resolved path. Path aliases
(`@/db/schema`) need their own pattern.

## Sample graph rules (dependency-cruiser)

```js
// .dependency-cruiser.cjs (excerpt)
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'adapter-not-to-db', severity: 'error',
      comment: 'Rule 10 — an adapter that persists is doing two jobs (onion-architecture).',
      from: { path: '^src/adapters/' }, to: { path: '^src/db/' } },
    { name: 'adapter-not-to-feature', severity: 'error',
      comment: 'Rule 10 — infrastructure must not know features (onion-architecture).',
      from: { path: '^src/adapters/' }, to: { path: '^src/modules/' } },
    { name: 'adapter-not-to-container', severity: 'error',
      comment: 'Rule 9 — adapters receive dependencies, they do not look them up.',
      from: { path: '^src/adapters/' }, to: { path: '^src/platform/container' } },
    { name: 'platform-not-to-feature', severity: 'error',
      comment: 'Rule 10 — only the composition root may know modules (onion-architecture).',
      from: { path: '^src/platform/', pathNot: '^src/platform/container' },
      to: { path: '^src/modules/' } },
    { name: 'no-cross-module-reach-in', severity: 'error',
      comment: 'Rule 10 — resolve shared entities from the composition root (onion-architecture).',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] } },
    { name: 'contract-stays-pure', severity: 'error',
      comment: 'Ring 0 — contracts import only contracts and the schema library.',
      from: { path: '^src/contracts/' },
      to: { pathNot: ['^src/contracts/', '^node_modules/zod/'] } },
    { name: 'port-stays-pure', severity: 'error',
      comment: 'Ring 1 — ports import only ring 0.',
      from: { path: '^src/ports' },
      to: { pathNot: ['^src/ports', '^src/contracts/', '^node_modules/zod/'] } },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: false,
  },
};
```

`tsPreCompilationDeps` is deliberately `false`: `import type` is erased at compile time, so a
type-only import of the container is not a runtime edge. That is what lets ring 2 name the
shape it needs without the composition root becoming a runtime dependency — and it is why
the `container ↔ modules/**` relationship is not reported as a cycle.

---

## Reading a failure

A lint failure names the rule and points back at the rules file:

```
src/modules/orders/service.ts
  1:1  error  'drizzle-orm' import is restricted from being used by a pattern.
              Rule 2 — persistence is ring 3. Move the query into
              modules/<name>/repository.ts and inject it (onion-architecture)   no-restricted-imports
```

A graph failure names the edge:

```
  error platform-not-to-feature: src/platform/jobs.ts → src/modules/orders/repository.ts
```

In both cases the fix is placement, not the rule. Move the code to the ring that owns it —
the query to a repository, the SDK behind an adapter, the shared constant inward.

---

## The grandfathered list

When the checks are introduced into an existing codebase, some violations already exist.
Freeze them file by file so the rules can be `error` for new code on day one, and keep every
rule a grandfathered file does **not** currently break — so it cannot drift further.

Keep the list in the project (next to the lint config or in its architecture docs), one table
per kind of breach:

| File or edge | Breaks | Intended fix |
|---|---|---|
| `modules/orders/service.ts` | imports `db/rows.ts`; a row type is in the public signature of `refund` | give the use case the 3–4 fields it reads; map in `helpers.ts` |
| `modules/{reports,settings}/routes.ts` | import `drizzle-orm` + `db/schema` | the missing halves of rule 11 — add `service.ts` + `repository.ts`, move the queries down |
| `adapters/auth/local.ts` | imports `db/client` and `db/schema` | accept a lookup function, or give the lookup its own small port |
| `modules/orders/service.ts` → `modules/inventory/constants.ts` | reads a job-kind constant | move cross-cutting constants to `modules/_shared/`; exempt this edge by path, not by folder, so no other cross-module edge slips through |

**Shrink this list. Never add to it.** If you need a new exception, read the last section.

### Holes worth knowing

Two gaps exist in any filename-driven setup; name them rather than pretend they are closed:

- **Unconventional filenames opt out silently.** A ring-2-ish file called `status.ts` or
  `pricing-rules.ts` matches no zone glob, so no zone applies to it. Giving a file a
  conventional name (`service.ts`, `helpers.ts`, `constants.ts`, `repository.ts`) is what puts
  it in a ring — prefer the conventional name even when the file is small, or add the new
  name to the zone.
- **Rules 5, 6, 9 and 11 have no machine check.** They are in the SKILL.md checklist because
  that is the only place they can be.

---

## Adding an exception

In order of preference:

1. **Move the code.** Nearly always the right answer, and usually smaller than it looks.
2. **Widen a ring definition** in the project's layer map *and* the zone glob, when a file
   genuinely belongs to a ring the map does not yet name. Change the map, not just the config,
   or the two disagree and the next reader believes the wrong one.
3. **A one-line, commented per-file override** in the relevant config, added to the
   grandfathered table with its intended fix. Every entry is a debt with a name.

What not to do: delete a rule, turn a zone to `warn`, add a blanket
`/* eslint-disable no-restricted-imports */`, or move a file to a non-conventional name so no
zone matches it. All four work, and all four turn the check into decoration.

When a rule turns out to be wrong rather than inconvenient, record why where the project
keeps its engineering decisions, then change the rule and the map together.

---

## Sources

- [`no-restricted-imports`](https://eslint.org/docs/latest/rules/no-restricted-imports) — the
  `patterns` / `group` form; it matches the import specifier as written.
- [`@typescript-eslint/no-restricted-imports`](https://typescript-eslint.io/rules/no-restricted-imports/)
  — adds `allowTypeImports`.
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) ·
  [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
  — `forbidden` rules, `circular`, and the `$1` back-reference in `to.pathNot` that
  `no-cross-module-reach-in` is built on.
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — the
  declarative alternative: named element types and an allow/disallow policy instead of
  hand-written zones. The escape hatch when the zone list stops scaling.
- [Ensuring dependency rules in a Node + TypeScript app with eslint-plugin-boundaries](https://medium.com/@taynan_duarte/ensuring-dependency-rules-in-a-nodejs-application-with-typescript-using-eslint-plugin-boundaries-68b70ce32437)
- [Validate dependencies according to Clean Architecture](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c)
