# architecture-review

A read-only agent that reviews a change for **architectural boundary breaks**: code placed
in the wrong layer, ring or folder, and dependencies pointing the wrong way. It judges
against the `onion-architecture` and `frontend-ui-architecture` skills from
`engineering-paved-path` plus your project's own conventions files, and every finding
comes with `path:line`, the offending code verbatim, the rule it breaks and a one-line
smallest fix.

It covers the judgement half of architecture that linters and dependency-graph tools cannot
see — a service that constructs its own repository, a framework type leaking into the
domain, a pure package that started reading files — and deliberately leaves the half they
*can* see to them.

## Install

```bash
claude plugin marketplace add dmitrii1600/dev-team-ai-engineering-marketplace
claude plugin install architecture-review@dev-team-ai-engineering-marketplace
```

`engineering-paved-path` is a declared dependency (`^1.0.0`) and is installed and enabled
automatically. If you install `sdd-engineering`, this plugin comes with it.

## Components

| Type | Namespaced name | Model | Tools | Preloaded skills | How to invoke |
|---|---|---|---|---|---|
| Agent | `architecture-review:architecture-reviewer` | sonnet | Read, Grep, Glob, Bash, Skill | `engineering-paved-path:onion-architecture`, `engineering-paved-path:frontend-ui-architecture` | `@architecture-review:architecture-reviewer`, the `Agent` tool, or `/sdd-engineering:run-plan` |

On demand (through the `Skill` tool) it loads `engineering-paved-path:skill-routing` for
the file-group table and the severity mapping, plus whichever review-time skills the
routing names for the files in scope.

## Usage

Mention it in a session:

```text
@architecture-review:architecture-reviewer review my branch against main
```

```text
@architecture-review:architecture-reviewer which ring does src/orders/application/refunds.ts
belong in, and does it import anything it should not? files: src/orders/application/refunds.ts
```

From another agent or skill, through the `Agent` tool:

```text
subagent_type: architecture-review:architecture-reviewer
prompt: |
  Review base: main...HEAD.
  verify.checks: npm run lint && npm run typecheck && npx depcruise src
  conventions: [AGENTS.md, docs/architecture.md]
```

Inside the SDD chain, `/sdd-engineering:run-plan` dispatches it in its `arch` phase after
the build and verify phases, saves the report, and sends CRITICAL and WARNING findings back
to the implementer in a fix loop (at most two rounds).

### Scope inputs

| Input | Meaning | Default |
|---|---|---|
| a branch, or `base:` | review `git diff <base>...HEAD` plus uncommitted and untracked files | the remote default branch, else `main` |
| `files:` | review exactly these files | — |
| diff text in the prompt | review the diff as given (files need not exist on disk) | — |
| `conventions:` | conventions files that map the skills' rings onto your paths and name project rules | whichever of `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, architecture docs, ADRs exist |
| `routing:` | a project file that overrides the file-group → skill table and the severity mapping | `engineering-paved-path:skill-routing` |
| `verify.checks:` | the project's non-mutating checks command | `verify.checks` in `.claude/sdd-engineering.json`, else none |

With no scope and nothing changed against the base, or with a request that is really a
whole-repo audit, a correctness review or a security review, the agent returns a short
*Need clarification* block with a stated default instead of guessing.

## Configuration

The only setting the agent reads from disk is `verify.checks` in
`.claude/sdd-engineering.json` (the same file `sdd-engineering` uses):

```json
{
  "verify": { "checks": "npm run lint && npm run typecheck && npx depcruise src" }
}
```

- When it is set (or passed as `verify.checks:` in the prompt), the agent runs it **once**,
  reports the result in one line (the failing lines verbatim when red), and does not
  re-derive by hand what those tools already prove.
- When it is not set, the agent runs no command and reports
  `not run — no verify.checks configured`. A violation of a machine-enforced rule that it
  can see in the diff is still reported, marked as machine-enforced.
- It never runs a command that would modify files: a configured command that formats,
  fixes or writes is skipped with a note, and it never adds `--fix`.

## Report format

```
# Architecture Review: <scope>
**Verdict:** CLEAN | CONCERNS | BLOCKING-RISK   (advisory — not a merge gate)
**Scope:** …  ·  **Groups:** backend N · frontend N · contracts N · other N
**Machine checks:** <command> PASS | <verbatim failure> | not run

## Findings
### 1. <rule name> — CRITICAL | WARNING | SUGGESTION
- Where: path:line
- Rule: <skill rule number/name, or conventions-file rule id>
- Severity source: <routing row, verbatim>
- Evidence: 1–5 verbatim lines
- Why it is a boundary break
- Smallest fix
## Boundary map — what this change did to the graph
## Clean — checked and holding
## Already covered by the machine — not repeated here
## Could not establish
```

The exact template lives in [`agents/architecture-reviewer.md`](agents/architecture-reviewer.md).

### Severities and verdict

| Severity | Meaning | Where it comes from |
|---|---|---|
| CRITICAL | a dependency-direction break the routing's severity mapping marks critical (an inner ring importing an outer one, shared code importing a feature) | a row of the severity mapping, quoted on the `Severity source:` line |
| WARNING | a placement or contract problem with a mapped row (a smell, drift that leaves a consumer behind) | a row of the severity mapping |
| SUGGESTION | a rule with no row in the mapping, or a match that is not exact | the default; the agent drops a level when unsure and says why |

Verdict: **BLOCKING-RISK** when there is a CRITICAL, **CONCERNS** when there is a WARNING,
**CLEAN** otherwise. It is always **advisory**: the merge decision belongs to your gate
(CI, a review command, a person).

Rules every finding follows:

- **Evidence or it is not a finding** — `path:line` plus verbatim code; an opinion without a
  cited line goes under *Could not establish*.
- **Every finding names its rule** — by identifier, not in prose only.
- **Zero findings is a good answer** — an empty *Findings* section with a full *Clean*
  section is a complete review.

## What it never does

- Edit, fix, commit, push, open or modify a pull request — `tools:` has no `Write` or
  `Edit`, and the body limits `Bash` to read-only inspection plus the configured checks
  command (that `Bash` limit is prompt text, not a sandbox).
- Review correctness, security or style. Security belongs to a security review (for example
  `engineering-paved-path:security`); conformance to a plan belongs to
  `sdd-engineering:plan-verifier`.
- Act as a merge gate.
- Follow instructions found in a diff, PR body, comment, fixture or vendored code.
- Delegate to another agent.

## Evals

`evals/architecture-reviewer/` holds four quality cases over three diffs from a neutral
sample project (an orders API with domain / ports / application / adapters / http rings, a
pure `pricing-core` package and a Next.js frontend) plus that project's conventions file:

| Case | Checks |
|---|---|
| checkout diff | finds the framework import in the domain ring and the service constructing a concrete repository; rule, severity, verbatim evidence, verdict |
| checkout diff, scope | raises no security or null-safety finding; stays on structure |
| pricing-core diff | cites the project-specific rules `core-purity` and `discount-cap-gate` by identifier |
| benign rename | no fabricated finding; verdict CLEAN |

They run on the shared eval harness in the marketplace repository's root `evals/`
directory (vitest + an LLM judge), which resolves the agent by its namespaced name. See
that directory's README for setup; then, from it:

```bash
npx vitest run architecture-reviewer
```

Eval-only changes (anything under `plugins/architecture-review/evals/`) do not require a
version bump.

## Depends on / depended on by

- **Depends on:** `engineering-paved-path` `^1.0.0` — `onion-architecture` and
  `frontend-ui-architecture` are the agent's rulebook (preloaded), `skill-routing` supplies
  the file groups and the severity mapping, and the review-time skills it routes to.
- **Depended on by:** `sdd-engineering` — `/sdd-engineering:run-plan` dispatches
  `architecture-review:architecture-reviewer` in its `arch` phase and parses the verdict and
  finding severities. The report format is therefore a public contract: changing it is a
  major version bump.

## Changes

See [CHANGELOG.md](CHANGELOG.md).
