# Spec template

The exact file `sdd-engineering:spec-creator` writes and `spec-lint.mjs` checks. Copy it,
keep every heading in this order, and replace each `<…>`. The example lines use a neutral
domain (orders and invoices); replace them, do not keep them.

```
# Spec: <feature>
Spec ID: SPEC-YYYY-MM-DD-short-name
Status: draft
Supersedes: SPEC-<yyyy-mm-dd>-<other-name> | none
Packages: <packages, apps or services touched — or "single app">

## Problem and user
<Who is blocked, on what, what they do today instead. 2–6 sentences.>
**Request vs tree:** <where the request's premise matches the code and where it does
not, with path:line; or "matches">

## Goals / Non-goals
**Goals**
- <observable outcome>
**Non-goals**
- <deliberately out, and where it goes if anywhere>

## User stories
- **US-1** As a <role>, I want <capability> so that <outcome>.

## Acceptance criteria (EARS)
- **AC-1** WHEN <event>, the system shall <response>. · traces: US-1 · verify: component
- **AC-2** The system shall <response>. · traces: US-1 · verify: e2e

## Edge cases
- **EC-1** IF <unwanted condition>, THEN the system shall <response>. · traces: DR-2 · verify: component

## Design review
**Source:** <specsDir>/designs/<slug>/<file> | none — checklist run against the tree
### Gaps
- **DR-1** <need> — nothing provides it today (checked path:line)
### Uncovered cases
- **DR-2** <state the design does not show> → EC-1
### Module interactions
| From | To | Through | Contract |
|---|---|---|---|
| `web` <surface> | `api` module `<name>` | `GET /orders/:id` | `OrderSummary` in <shared contracts location> · existing \| new |
### UX improvements
- **DR-3** *proposed* <change> — motivated by US-n / EC-n

## Non-functional requirements
- **NFR-1** <category>: <checkable statement> · verify: <lane>

## Traceability
| Requirement | Traces to | Verify how |
|---|---|---|
| AC-1 | US-1 | component |
| EC-1 | DR-2 | component |
| NFR-1 | US-1 | static |
<every AC, EC and NFR has a row; every US and every DR-n gap/uncovered item is cited by
at least one row, or is listed under Open questions as unowned>

## Inputs and provenance
| Source | Path or URL | What it settled |
|---|---|---|
| request | <conversation / brief> | <…> |
| answers | <re-invocation answers, quoted> | <…> |
| research | <researcher report title or path> | <…> |
| design | <specsDir>/designs/<slug>/<file> | <…> |
| repo | path:line | <…> |
| insights | <insights file>:<line> — only when `insights` is set | <…> |

## Untrusted inputs
| Input | Source | Validation | On invalid |
|---|---|---|---|

## Open questions
- **Q-1 (blocking):** <question the planner cannot proceed past> — <who decides>
- **Q-2 (non-blocking):** <question settled later> — <default taken in this draft>
<Once answered: a dated **Resolved decisions** line, then "- Q-n, resolved: <decision> (<affected ids>)"; the IDs are kept so references stay valid.>
<If none: "- None outstanding for the stated scope.">
```

## What each section holds

| Section | Holds | Never holds |
|---|---|---|
| Problem and user | who is blocked, on what, what they do instead; *Request vs tree* with `path:line` | the solution |
| Goals / Non-goals | observable outcomes; what is deliberately out and where it goes | tasks, file names |
| User stories | `US-n`: As a <role>, I want <…> so that <…> | acceptance detail |
| Acceptance criteria (EARS) | `AC-n`, one EARS pattern each, checkable · `traces:` · `verify:` | implementation, internal state |
| Edge cases | `EC-n`, preferably IF … THEN · `traces:` · `verify:` | happy paths already covered by an AC |
| Design review | `DR-n`: Gaps · Uncovered cases · Module interactions · UX improvements (*proposed*) | a layer or folder assignment |
| Non-functional requirements | `NFR-n`: latency, caps, i18n, accessibility, degraded mode, cost, retention, concurrency, observability · `verify:` | style rules |
| Traceability | one row per AC / EC / NFR: traces to · verify how | identifiers that do not exist |
| Inputs and provenance | request · answers · research · design · repo · insights, kept apart | runtime inputs |
| Untrusted inputs | runtime inputs only: Input · Source · Validation · On invalid | the spec's own sources |
| Open questions | `Q-n (blocking \| non-blocking)` with who decides or the default taken; *Resolved decisions* once answered | silence — write "None outstanding for the stated scope." |

## Identifier rules

- Prefixes: `US`, `AC`, `EC`, `NFR`, `DR`, `Q`. Numbering is dense from 1, no gaps, no
  repeats — `spec-lint` warns on the first gap per prefix.
- An identifier is never renumbered once a plan cites it. A dropped criterion is struck
  through or marked *withdrawn*, keeping its number.
- `traces:` points at a `US-n` or a `DR-n`. `verify:` is one of `unit`, `component`,
  `integration`, `e2e`, `static`, `manual`.
- An open question keeps its `Q-n` after it is answered: `- Q-2, resolved: <decision>
  (AC-3, EC-1)` under a dated **Resolved decisions** line.

## A filled example line per section

```
- **US-1** As an accountant, I want to download an invoice as PDF so that I can attach it to an email.
- **AC-1** WHEN the user selects "Download PDF" on an invoice, the system shall start a download named `invoice-<number>.pdf`. · traces: US-1 · verify: e2e
- **EC-1** IF the invoice has more than 500 line items, THEN the system shall show "Too large for PDF — export as CSV" and start no download. · traces: DR-2 · verify: component
- **NFR-1** Latency: the PDF for an invoice of up to 100 line items is ready within 3 seconds at the 95th percentile. · verify: integration
- **DR-1** No PDF renderer exists in the backend today (checked `api/src/invoices/service.ts:12`).
- **Q-1 (non-blocking):** Paper size A4 or Letter? — default A4 in this draft; product owner decides.
```
