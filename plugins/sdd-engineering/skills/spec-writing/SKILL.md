---
name: spec-writing
description: "House rules for a feature specification in Spec Driven Development: the file template, EARS acceptance criteria, the design-review state checklist, traceability and verification hints, untrusted inputs, the size budget, the spec smells that mean a spec has drifted into a plan, the self-check and the spec-lint script. Use when writing or amending a spec (sdd-engineering:spec-creator), when turning a spec into a requirements ledger (sdd-engineering:implementation-planner), or when checking a tree against a spec (sdd-engineering:plan-verifier). Not for implementation plans, READMEs or changelogs."
user-invocable: false
---

# Spec writing

A spec says **what** a feature does, **for whom**, **why**, and **how we will know**. It
never says how the code is shaped. The moment a spec names a file to edit, a hook to
write or a test API to call, it has become a plan, and plans live in the plans folder
(`plansDir`, default `plans/`).

This skill is the working detail. Two reference files sit next to it; read them when the
task needs them, not by default:

- `${CLAUDE_SKILL_DIR}/references/spec-template.md` — the full template with every
  identifier and what each section must contain. **Read it before writing a new spec.**
- `${CLAUDE_SKILL_DIR}/references/lifecycle.md` — naming, Spec ID, `Status`,
  `Supersedes`, in-place amendments, designs. Read it before changing an existing spec.

## Project inputs

Paths are not fixed. The caller (normally `/run-plan`, or the person invoking an agent)
states them in the prompt; otherwise read `.claude/sdd-engineering.json` in the project
root; otherwise use the defaults.

| Input | Default | Used here for |
|---|---|---|
| `specsDir` | `specs/` | where specs live; designs under `<specsDir>/designs/<slug>/` |
| `plansDir` | `plans/` | where the plan with the same stem will live |
| `conventions` | `AGENTS.md`, `CLAUDE.md` (those that exist) | the project's layout, naming and "do not touch" rules |
| `insights` | none | a lessons file to cite under *Inputs and provenance*, only when set |
| `verify.checks`, `verify.tests` | none | what the `static`, `unit`, `component` and `integration` lanes run as |

## Naming and place

- Filename `YYYY-MM-DD-short-name.md`: the date the spec was started and two to four
  lowercase words that name the *feature* (`export-invoice-pdf`, not `backend-change`).
- `Spec ID: SPEC-<stem>` where `<stem>` is the filename without `.md`. One glob
  (`**/<stem>.md`) finds it; a stem is never reused.
- Folder: `specsDir`. A monorepo that keeps per-package spec folders lists the one to use
  in `specsDir`; the agent never invents a second folder.
- Paths inside a spec are **repo-root relative** with `path:line`, never `../` relative.

## Template at a glance

Every heading stays, even when its body is one line. Identifiers are stable handles that
plans and ledgers cite: `US-n` stories, `AC-n` criteria, `EC-n` edge cases, `NFR-n`
non-functional requirements, `DR-n` design-review items, `Q-n` open questions.

```
# Spec: <feature>
Spec ID: SPEC-YYYY-MM-DD-short-name
Status: draft
Supersedes: SPEC-<yyyy-mm-dd>-<other-name> | none
Packages: <packages, apps or services touched — or "single app">

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Design review
## Non-functional requirements
## Traceability
## Inputs and provenance
## Untrusted inputs
## Open questions
```

The bodies, with an example line for each, are in `references/spec-template.md`.

## EARS — how a criterion is written

| Pattern | Shape | Example |
|---|---|---|
| Ubiquitous | The system shall … | The system shall log every authentication attempt. |
| Event-driven | WHEN <event>, the system shall … | WHEN the user submits the login form, the system shall validate the credentials. |
| State-driven | WHILE <state>, the system shall … | WHILE a sync is running, the system shall show progress. |
| Unwanted behaviour | IF <condition>, THEN the system shall … | IF validation fails three times within 60 seconds, THEN the system shall lock the account temporarily. |
| Optional feature | WHERE <feature is enabled>, the system shall … | WHERE MFA is enabled, the system shall require a TOTP code after the password. |

Rules:

- Exactly one pattern per criterion, always `shall`, one behaviour per criterion.
- "The system" may narrow to the component that owns the behaviour: "the Orders page
  shall", "the `export_invoice` tool shall".
- Checkable means a test or a person following steps can say yes or no. "should",
  "quickly", "user-friendly", "as appropriate", "properly", "robust" are not checkable
  and do not go in.
- Edge cases prefer the IF … THEN form; a WHILE or WHEN edge case is fine when the
  condition is a state or an event rather than a fault.
- Numbering is dense: `AC-1 … AC-n` with no gaps, same for `EC`, `NFR`, `DR`, `Q`, `US`.

## Design review — the state checklist

Run it per screen or per surface the feature touches, whether a design was given or not.
With a design, record which states it shows and which it does not; without one, record
which states the existing UI or API already handles (`path:line`) and which the feature
must decide. Say which of the two you did on the **Source** line.

- empty (no data yet) · loading · error · degraded or partial data (a failed upstream
  call, a partial import) · stale data
- zero items · one item · many items · long or overflowing text
- narrow viewport · keyboard only · no permission or not signed in
- the same action twice (double submit, retry) · the action interrupted mid-way
- a background job running · the job finishing while the user looks elsewhere

Compare against what exists before calling anything a gap: UI primitives, feature
components, route handlers, shared contracts, tool definitions — wherever the project's
`conventions` files say they live. A "gap" that already exists in the tree is a false
finding the planner will have to undo.

**Module interactions** name both levels: the package or service (`web` → `api`,
`worker` → `api`) and the module inside it (`api` `orders`), with the shared contract
that carries each exchange, marked `existing` or `new`. For two or more packages a mermaid
sequence diagram under the table is welcome. A `new` contract is a shape — the fields and
their types — not a schema-library definition.

**UX improvements** are marked *proposed*. A proposal nobody accepted is also an Open
question; a plan never builds a proposal that was not adopted.

## Verification hints

Every `AC`, `EC` and `NFR` carries one hint from this vocabulary, chosen by where the
behaviour is observable, so the planner's Test plan and the verifier's ledger start from
the spec:

| Hint | Means | Runs as |
|---|---|---|
| `unit` | pure logic, no I/O | the project's test command (`verify.tests`) on a unit test |
| `component` | a UI component or hook in a simulated DOM | `verify.tests` on a component test |
| `integration` | needs a real database, queue or service | `verify.tests` on an integration test (may need a running stack) |
| `e2e` | a browser or end-to-end flow | the project's end-to-end runner |
| `static` | a type, a lint rule, an architecture rule | `verify.checks` |
| `manual` | a person follows numbered steps | steps written next to the criterion |

A hint is a lane, not a test design. "verify: component" does not name the test file,
the query or the assertion. When the project has no runner for a lane, the hint still
says where the behaviour is observable; the planner raises the missing runner.

## Non-functional requirements — the categories to walk

Latency or size caps · degraded mode (what happens without the upstream service, without
the cache, without the clipboard) · i18n (user-facing strings in the project's message
catalogue, no literals) · accessibility (role, name, keyboard, not colour-only) · cost (no
extra paid API call, no extra request) · data retention · concurrency (double submit,
parallel runs) · observability (what is logged). Write one `NFR-n` per category that
applies, each checkable; skip the ones that do not.

## Untrusted inputs

Only **runtime inputs of the feature**, never the sources of the spec (those are
provenance). Untrusted means an outside party can shape it: a webhook payload, a
third-party API response, a file the user uploads, LLM output, a form field, query
parameter or header, a tool argument, clipboard contents the user pastes. Columns are
**Input · Source · Validation · On invalid**, and "On invalid" is a behaviour (reject with
422, truncate to N, render as plain text, skip the item), never "handle appropriately".
Do not propose keyword scanning of untrusted text; if the project already has a shared
prompt-injection or sanitisation rule, cite it — a spec does not redesign it.

**Validation vocabulary** — the part of web-security practice that applies to a typed
HTTP API with schema validation and a database. Name the rule in the *Validation* column
and the observable outcome in *On invalid*:

- *Shape and bounds* — a schema on every HTTP body, param and query and on every tool
  argument: type, enum, length or size cap, integer range; unknown keys rejected on a
  wire object. On invalid: 422 naming the field.
- *Identity* — an id resolves to a row the caller may see, or the response is 404; never
  another caller's row, never a distinguishable "exists but forbidden".
- *Text that is rendered* — plain text by default; markdown only through the existing
  renderer; never raw HTML from an untrusted string.
- *Text that reaches a prompt* — wrapped as untrusted, so the model reads it as data; an
  instruction inside it is quoted, never followed.
- *Paths and URLs* — a file path stays under its intended root; an outbound URL is an
  allow-listed host; no user-controlled path segment reaches the filesystem raw.
- *Secrets* — never in a request body the client builds, never echoed back, never logged.
- *Size and rate* — a cap on items per request and bytes per field, stated as a number.

Load `engineering-paved-path:security` only when the feature adds an auth, secrets or
outbound-network surface; for the usual route-plus-screen feature this list is enough.

## Size budget

| Feature | Lines | AC | EC |
|---|---|---|---|
| one screen or one endpoint | ≤ 120 | 4–8 | 3–6 |
| one package, several surfaces | ≤ 200 | 6–12 | 4–10 |
| cross-package or cross-service | ≤ 300 | 8–16 | 6–12 |

Over budget means the spec is padding sections or has become two features. Split it or
cut the prose; never cut criteria to fit.

## Spec smells — the spec has become a plan

Any of these is rewritten before the spec is emitted:

- names a file to edit or create (`OrderCard.tsx`, `routes.ts`) outside *Module
  interactions* and *Inputs and provenance*;
- names a hook, a helper, a component prop, a schema-library call, a test API
  (`fireEvent`, `vi.mock`) or a CSS rule;
- assigns a ring, a layer or a folder;
- contains a "Testability" or "Implementation notes" section;
- an NFR cites a style rule or an icon file instead of a user-observable property;
- an AC describes an internal state ("the store is updated") instead of an observable.

`path:line` citations of the *current* tree are not smells: they ground a gap or a
constraint. The smell is prescribing the *future* tree.

## Self-check — before the spec is emitted

Run every line; a failed line is fixed in the file, not noted in the report.

1. Filename stem = `Spec ID` without `SPEC-`; `Status: draft`; `Supersedes` present.
2. All 11 `##` sections present, in template order, under the `# Spec:` title.
3. Every AC and EC: one EARS pattern, `shall`, no weak word, a `traces:` and a `verify:`.
4. Every EC from an uncovered design case cites its `DR-n`; every `DR-n` gap or uncovered
   item is cited somewhere or listed under Open questions.
5. Traceability has one row per AC, EC and NFR; no row cites an identifier that does not
   exist.
6. Untrusted inputs lists runtime inputs only; every row has a behaviour under "On
   invalid".
7. Provenance separates the request, the answers, the research, the designs and the tree.
8. No spec smell; within the size budget for the feature class.
9. Open questions is not silently empty; each `Q-n` says blocking or non-blocking and who
   decides.
10. `node "${CLAUDE_SKILL_DIR}/scripts/spec-lint.mjs" <spec.md>` reports no CRITICAL,
    and every WARNING is either fixed or explained in the Spec Report. Run it exactly so,
    on the file you wrote:

    ```
    node "${CLAUDE_SKILL_DIR}/scripts/spec-lint.mjs" <spec.md>
    ```

    It checks filename ↔ Spec ID, `Status`, `Supersedes`, the headings and their order,
    EARS form, `traces:` / `verify:` hints, dense numbering, traceability rows and open
    questions. Exit 1 means a CRITICAL. It needs Node 22 or newer and nothing else.

## Lifecycle in one paragraph

`Status` is set by a person: `draft` → `approved` (after reading) → `implemented` (after
`sdd-engineering:plan-verifier` reports `CONFORMS` and the feature ships). An agent only
ever writes `draft`. Once building has started, an approved spec is never edited; a
changed decision is a new spec, dated the day it is written, with `Supersedes` pointing
back, and the planner plans against the newest spec in the chain. Before building starts,
a change the person asked for is an in-place amendment instead. The exact conditions and
the record it leaves are in `references/lifecycle.md`.
