# Plan format

A plan says **how** a feature gets built: numbered steps with file paths, the layer each
file lives in, the skills the implementer must load, an observable "done when" and a
verify command per step. It is produced by `sdd-engineering:implementation-planner` from
an approved spec and consumed by `sdd-engineering:implementer` (one invocation, or one
per track in multi-agent mode) and `sdd-engineering:plan-verifier`.

A plan is **not** a spec. The spec (`<specsDir>/YYYY-MM-DD-short-name.md`, see the
`sdd-engineering:spec-writing` skill) says *what* and *why* — problem and user, goals,
EARS acceptance criteria, edge cases, design review, untrusted inputs — and is drafted
by `spec-creator` and approved by a person before planning. The planner never fills a
missing spec section; it reports the gap and asks.

## Convention

- One file per plan: `<plansDir>/YYYY-MM-DD-short-name.md`, with the **same stem** as the
  spec it implements (`specs/2026-10-15-export-invoice-pdf.md` →
  `plans/2026-10-15-export-invoice-pdf.md`). A plan without a spec takes the date it was
  written plus a two-to-four-word feature name; a spec without the dated name lends its
  own stem unchanged.
- The planner writes the file itself and returns a short **Plan Report** with the path.
  The implementer and the verifier are handed that path, never a summary. When the
  planner returns a *Requirements review* instead, nothing is written yet.
- An existing plan with the same stem is never overwritten; the planner reports the
  collision.
- Delete a plan or move it to `<plansDir>/done/` once the feature ships — do not leave a
  stale plan where an agent will read it as current work.

## What `/sdd-engineering:run-plan` parses

Only the header (`sed -n 1,12p`) and a few `grep`s — so these must be exact:

| Field | Where | Used for |
|---|---|---|
| `**Plan ID:**` | header | every agent prompt; the summary title |
| `**Spec:**` | header | intake checks the spec's `Status` |
| `**Execution mode:**` | header | `single-agent` → one implementer; `multi-agent` → step 0, tracks, Integration |
| `## Tracks` | multi-agent only | one implementer per row, run in parallel |
| `- **Blocking:**` | *Open questions* | a still-open blocking question stops the run |

## The plan file

The template `sdd-engineering:implementation-planner` writes. This file is the source of
truth: the planner reads it before writing a plan, and people read it to review one.

```
# Implementation Plan: <task>

**Plan ID:** <stem>  ·  **Spec:** [<specsDir>/<stem>.md](<specsDir>/<stem>.md) or "none"  ·
**Execution mode:** single-agent | multi-agent  ·  **Packages:** <…>  ·
**Assumptions:** <or "none">

## Summary
<2–5 sentences: what we are building and why this shape. No preamble.>

## Requirements review
<the Step 0 block, condensed: ledger kept; "Execution mode: stated by caller";
"Verify commands: checks `<cmd>` · tests `<cmd with {file}>`";
each recommendation marked adopted / not adopted — why>

## Context read
| File | What it settled |
|---|---|
| [AGENTS.md](AGENTS.md) | <…> |
| [<insights file>:41](<insights file>:41) | <…> |

## Lessons that bind this work
1. **<entry title>** — [path:line](path:line) — how the plan honours it.
2. …
<Up to three. If a step brushes against a recorded dead end, say which and why it is
safe. If none apply: "- None found in the conventions or insights.">

## Constraints
- <layer rule that applies, and to which files>
- <contract-once + mirror, if a contract changes>
- <naming rule that applies: test suffix, import extensions, translation namespace, …>
- <do-not-touch paths this task comes near>

## Skill contract
| File group | Skills the implementer MUST load | Why |
|---|---|---|
| `<backend>/orders/routes.ts` | `engineering-paved-path:onion-architecture`, `engineering-paved-path:fastify-best-practices` | route = layer boundary + HTTP surface (`engineering-paved-path:security` is review-time) |
| `<frontend>/app/orders/_components/**` | `engineering-paved-path:frontend-ui-architecture`, `engineering-paved-path:react-best-practices` | placement + component rules |
<Derived from the write-time row of the routing table (`routing` input) — not invented
here. Namespaced names only. Each skill is loaded once per implementer run.>

## Tracks
<multi-agent only — omit the section entirely in single-agent mode>
| Track | Owned files (exclusive) | Steps | Verify | May start after |
|---|---|---|---|---|
| 0 — shared | `<shared contracts>/orders*` | 0 | `<verify.checks>` | — |
| A — backend | `<backend>/orders/**`, `<backend tests>/orders*` | 1–3 | `<verify.checks>` · `<verify.tests, {file} = backend test>` | step 0 |
| B — frontend | `<frontend>/app/orders/**`, `<frontend>/hooks/use-orders.ts` | 4–5 | `<verify.checks>` · `<verify.tests, {file} = component test>` | step 0 |
| shared — integration | <the files only the last step edits> | 6 | `<verify.checks>` then `<verify.tests, whole suite>` (the one full run) | A, B |
<No path appears in two rows. Each track is one sdd-engineering:implementer invocation.>

## Steps
### 0. <contract first — multi-agent: Track: shared>
- **Files:** [`path`](path) (edit) · `path/new-file.ts` (new)
- **Track:** shared <multi-agent only>
- **Layer:** <layer / folder rule>
- **Skills:** <namespaced, from the contract>
- **Do:** <what changes, in 1–4 bullets; interfaces, not diffs>
- **Done when:** <observable condition>
- **Verify:** `<verify.checks, literally>`

### 1. <goal in one line>
- **Files:** …
- **Track:** A <multi-agent only>
- …

### N. Integration <multi-agent only — Track: shared>  /  Final check <single-agent>
- **Files:** <wiring that needs every track finished>
- **Done when:** <the end-to-end observable>
- **Verify:** `<verify.checks>` then `<verify.tests with {file} removed>` — the one full run

## Test plan
| Scope | Command | Covers |
|---|---|---|
| per step | `<verify.checks>` | lint · typecheck · static checks |
| per test file | `<verify.tests with {file}>` | the test a step adds or changes |
| final | `<verify.tests with {file} removed>` | the whole suite, once |
| <slow lane> | `<command>` | <integration / e2e — only when a step adds one, and say what it needs (Docker, a running stack)> |

## Risks & rollback
- **<risk>** — <what breaks, how it shows up> · rollback: <the one step that undoes it>

## Out of scope
- <what we are deliberately not doing>
- <multi-agent: no track edits a file owned by another track>
- Writing or amending the spec — a gap in it goes back to sdd-engineering:spec-creator or
  to the person who owns the decision, as an Open question.
- Architectural review and security review — separate agents and the configured gate own those.
- Committing, pushing or opening a PR — the person does that, after the configured `gate` if any.

## Open questions
- **Blocking:** <question the implementer cannot proceed past> — <who decides>
- **Non-blocking:** <question that can be settled after> — <default taken>
<If there are none: "- None outstanding for the stated scope.">
```

## Steps that can be executed

Each step is something the implementer can finish and check without asking anything:

- exact file paths, each marked `new` or `edit`; every `edit` path exists, every `new`
  path does not;
- the ring or layer it lives in, when the project enforces one;
- the skills it needs, from the *Skill contract*;
- a **Done when** that is observable, not "looks right";
- a **Verify** command, written out literally, and always the **narrowest** one that
  proves the step: `verify.checks` for a step with no test, `verify.tests` with `{file}`
  replaced by the test the step adds or changes. A step never verifies with the whole
  suite; the full run — `verify.checks` plus `verify.tests` with `{file}` removed —
  appears **once**, in the last step. When `verify.tests` has no `{file}` placeholder,
  steps verify with `verify.checks` only and the test command runs once, in the last
  step. When the project configured no `verify` commands, the planner asks for them in
  its *Requirements review*; when the answer is "none", the step's *Verify* says
  `none configured — <the observable check a person would make>`, and the verifier
  marks that row NOT VERIFIABLE unless it can observe the check itself;
- **boundary inputs** for every criterion that filters, excludes, caps or matches (paths,
  sizes, counts, name patterns): a root-level path, a case variant, a near-miss that must
  **not** match, a value exactly at the cap and one past it — named in *Done when* or a
  *Test plan* row with the test that pins it. A happy-path test proves the feature runs,
  not that the predicate is right;
- **literal copy, quoted**: when an AC fixes user-visible text (a title, a button label,
  an error line), the step that writes it quotes every string verbatim. "Use the exact
  AC-n titles" is not enough.

Order steps so the tree compiles between them where possible: contract first, then the
backend, then the frontend that consumes it.

## Tracks — multi-agent mode only

- A track is a set of steps one implementer executes on files **no other track touches**.
  Two tracks may never name the same path, and *Owned files* globs must not overlap.
- **Prefer one package per track.** Two tracks inside one package share one typecheck, so
  a half-written file in track A turns track B's verify red; when a package must be split,
  say so in *Risks* and make each track's verify `{file}`-scoped.
- Anything two tracks both need goes into **step 0, track `shared`**, which runs first: a
  shared contract and every copy of it, a migration, a registration entry, a new message
  catalogue namespace.
- The last step is **Integration, track `shared`**: the wiring that needs every track done,
  plus the one full verify. A track's own steps verify with `verify.checks` and the
  `{file}` form of `verify.tests` only. In single-agent mode the same last step is the
  *Final check*.
- If no partition with at least two disjoint tracks exists, the plan is single-agent.

## The Plan Report

The planner's final message — not the plan:

```
# Plan Report: <stem>

**File:** [<plansDir>/<stem>.md](<plansDir>/<stem>.md)  ·  **Spec:** [path](path) or "none"  ·
**Mode:** single-agent | multi-agent (N tracks)  ·  **Steps:** N  ·  **Packages:** <…>
**Ledger:** N requirements · N clear · N ambiguous · N contradict tree · N contradict conventions
**Recommendations:** N adopted · N not adopted
**Open questions:** N blocking · N non-blocking

## Needs a decision
- <each blocking question, one line, who decides>
<If none: "- Nothing blocking; the implementer can start.">

## Next
- <"/sdd-engineering:run-plan <plansDir>/<stem>.md" · single-agent: one
  sdd-engineering:implementer · multi-agent: "step 0 first, then tracks A, B in parallel,
  then Integration">
```

## Requirements ledger statuses

Exactly four: `clear`, `ambiguous`, `contradicts tree`, `contradicts conventions` (a
conventions file, or an `insights` entry when that input is set). A contradiction carries
the `path:line` that shows it.
Every `AC-n`, `EC-n`, NFR and *Untrusted inputs* row of the spec has a ledger row, and
every `AC-n` and `EC-n` is covered by at least one step's *Done when* or one *Test plan*
row.
